import { createHash } from "crypto";
import type { AssetClass } from "../types";
import type { EnvelopeState } from "../risk-envelope";
import {
  runBullBearDebate,
  runFundamentalAnalyst,
  runSoftRiskAnalyst,
  runTechnicalAnalyst,
  type FundamentalContext,
  type SoftRiskContext,
} from "./agents";
import { getCommitteeConfig, COMMITTEE_PROMPT_VERSIONS } from "./config";
import { certificatePermitsExecution, enforceSoftRiskOpinion, type EnforcedSoftRisk } from "./helpers";
import { buildExecutionIntent } from "./execution";
import { issueRiskCertificate } from "./hard-risk";
import type { CommitteeLlmClient } from "./llm";
import type {
  AnalystReport,
  DebateSynthesis,
  ExecutionIntent,
  OpportunityTicket,
  RiskCertificate,
} from "./types";

export type CommitteeRunResult = {
  runId: string;
  ticket: OpportunityTicket;
  status: "COMPLETED" | "FAILED" | "TIMEOUT" | "SKIP";
  outcome: "WOULD_EXECUTE" | "BLOCKED" | "SKIPPED" | "ERROR";
  shadow: boolean;
  wouldHaveExecuted: boolean;
  technical: AnalystReport | null;
  fundamental: AnalystReport | null;
  debate: DebateSynthesis | null;
  softRisk: EnforcedSoftRisk | null;
  certificate: RiskCertificate | null;
  executionIntent: ExecutionIntent | null;
  blocks: string[];
  errors: string[];
  injectionFlags: string[];
  latencyMs: number;
  modelVersions: Record<string, string>;
  promptVersions: Record<string, string>;
  triggerId?: string | null;
};

export type CommitteeRunInput = {
  ticket: OpportunityTicket;
  assetClass: AssetClass;
  envelope: EnvelopeState;
  vetoes: string[];
  envelopeBlocks: string[];
  equity: number;
  riskScale: number;
  fundamental: FundamentalContext;
  portfolio: SoftRiskContext;
  shadow?: boolean;
  triggerId?: string | null;
  llm: CommitteeLlmClient;
  timeoutMs?: number;
  broker?: "ALPACA_PAPER" | "ALPACA_LIVE";
};

function runIdFor(ticket: OpportunityTicket): string {
  return createHash("sha256").update(`${ticket.id}|${Date.now()}`).digest("hex").slice(0, 16);
}

function failResult(input: CommitteeRunInput, partial: Partial<CommitteeRunResult>, error: string): CommitteeRunResult {
  const started = partial.latencyMs ?? 0;
  return {
    runId: partial.runId ?? runIdFor(input.ticket),
    ticket: input.ticket,
    status: error.includes("TIMEOUT") ? "TIMEOUT" : "FAILED",
    outcome: "ERROR",
    shadow: input.shadow ?? getCommitteeConfig().shadow,
    wouldHaveExecuted: false,
    technical: partial.technical ?? null,
    fundamental: partial.fundamental ?? null,
    debate: partial.debate ?? null,
    softRisk: partial.softRisk ?? null,
    certificate: partial.certificate ?? null,
    executionIntent: null,
    blocks: partial.blocks ?? [],
    errors: [...(partial.errors ?? []), error],
    injectionFlags: partial.injectionFlags ?? [],
    latencyMs: started,
    modelVersions: partial.modelVersions ?? {},
    promptVersions: partial.promptVersions ?? { ...COMMITTEE_PROMPT_VERSIONS },
    triggerId: input.triggerId,
  };
}

/**
 * Shadow committee runner — full pipeline, no broker submission.
 * Fail-closed on timeout / invalid schema at any LLM stage.
 */
export async function runCommitteeShadow(input: CommitteeRunInput): Promise<CommitteeRunResult> {
  const t0 = Date.now();
  const cfg = getCommitteeConfig();
  const shadow = input.shadow ?? cfg.shadow;
  const timeoutMs = input.timeoutMs ?? cfg.timeoutMs;
  const perStageTimeout = Math.max(5_000, Math.floor(timeoutMs / 5));
  const runId = runIdFor(input.ticket);
  const promptVersions = { ...COMMITTEE_PROMPT_VERSIONS };
  const modelVersions: Record<string, string> = {};
  const errors: string[] = [];
  const injectionFlags: string[] = [];

  const technicalR = await runTechnicalAnalyst(input.llm, input.ticket, perStageTimeout);
  if (!technicalR.report) {
    return failResult(input, { runId, latencyMs: Date.now() - t0, promptVersions, errors, injectionFlags }, technicalR.error ?? "technical_failed");
  }
  modelVersions.technical = technicalR.report.model;

  const fundamentalR = await runFundamentalAnalyst(input.llm, input.ticket, input.fundamental, perStageTimeout);
  injectionFlags.push(...fundamentalR.flags);
  if (!fundamentalR.report) {
    return failResult(
      input,
      { runId, technical: technicalR.report, latencyMs: Date.now() - t0, promptVersions, errors, injectionFlags },
      fundamentalR.error ?? "fundamental_failed",
    );
  }
  modelVersions.fundamental = fundamentalR.report.model;

  const debateR = await runBullBearDebate(input.llm, {
    ticket: input.ticket,
    technical: technicalR.report,
    fundamental: fundamentalR.report,
    timeoutMs: perStageTimeout,
  });
  if (!debateR.synthesis) {
    return failResult(
      input,
      {
        runId,
        technical: technicalR.report,
        fundamental: fundamentalR.report,
        latencyMs: Date.now() - t0,
        promptVersions,
        errors,
        injectionFlags,
      },
      debateR.error ?? "debate_failed",
    );
  }

  const softRaw = await runSoftRiskAnalyst(input.llm, {
    ticket: input.ticket,
    debate: debateR.synthesis,
    portfolio: input.portfolio,
    timeoutMs: perStageTimeout,
  });
  const softRisk = enforceSoftRiskOpinion(softRaw.opinion ?? null, {
    entry: input.ticket.entry,
    structuralStop: input.ticket.stop,
  });
  if (!softRaw.opinion) errors.push(softRaw.error ?? "soft_risk_schema_fail");

  const certR = issueRiskCertificate({
    ticket: input.ticket,
    assetClass: input.assetClass,
    envelope: input.envelope,
    vetoes: input.vetoes,
    envelopeBlocks: input.envelopeBlocks,
    softRisk,
    debate: debateR.synthesis,
    equity: input.equity,
    riskScale: input.riskScale,
  });
  if (!certR.ok) {
    return failResult(
      input,
      {
        runId,
        technical: technicalR.report,
        fundamental: fundamentalR.report,
        debate: debateR.synthesis,
        softRisk,
        latencyMs: Date.now() - t0,
        promptVersions,
        errors: [...errors, certR.error],
        injectionFlags,
      },
      "certificate_invalid",
    );
  }

  const certificate = certR.data;
  const blocks = certificate.blocks;
  let executionIntent: ExecutionIntent | null = null;
  let wouldHaveExecuted = false;

  if (certificatePermitsExecution(certificate)) {
    const intentR = buildExecutionIntent({
      ticket: input.ticket,
      certificate,
      auditRef: runId,
      broker: input.broker ?? "ALPACA_PAPER",
    });
    if (intentR.ok) {
      executionIntent = intentR.data;
      wouldHaveExecuted = true;
    } else {
      errors.push(intentR.error);
    }
  }

  const outcome = wouldHaveExecuted ? "WOULD_EXECUTE" : blocks.length ? "BLOCKED" : "SKIPPED";

  return {
    runId,
    ticket: input.ticket,
    status: errors.length && !wouldHaveExecuted ? "FAILED" : "COMPLETED",
    outcome,
    shadow,
    wouldHaveExecuted: shadow ? wouldHaveExecuted : false,
    technical: technicalR.report,
    fundamental: fundamentalR.report,
    debate: debateR.synthesis,
    softRisk,
    certificate,
    executionIntent,
    blocks,
    errors,
    injectionFlags: [...new Set(injectionFlags)],
    latencyMs: Date.now() - t0,
    modelVersions,
    promptVersions,
    triggerId: input.triggerId,
  };
}
