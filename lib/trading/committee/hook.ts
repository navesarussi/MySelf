import { createHash } from "crypto";
import { openRiskR } from "../position";
import { drawdownFromPeak } from "../risk-envelope";
import type { AssetClass } from "../types";
import type { Account } from "../tick-context";
import type { TradingSettings } from "../store";
import { COMMITTEE_PROMPT_VERSIONS, getCommitteeConfig } from "./config";
import { envelopeFromAccount } from "./hard-risk";
import { createCommitteeLlm, type CommitteeLlmClient } from "./llm";
import { insertCommitteeRunSafe, maybeRecordReflection } from "./store";
import { runCommitteeShadow, type CommitteeRunInput, type CommitteeRunResult } from "./runner";
import type { OpportunityTicket } from "./types";

export type CommitteeHookItem = {
  ticket: OpportunityTicket;
  assetClass: AssetClass;
  vetoes: string[];
  envelopeBlocks: string[];
  triggerId?: string | null;
  headlines?: string[];
  earningsWindow?: boolean;
  /** Deterministic baseline would enter (from trigger upsert). */
  baselineWouldEnter?: boolean | null;
  /** Baseline agent-judge ENTER when available. */
  baselineAgentEnter?: boolean | null;
};

export type CommitteeHookContext = {
  settings: TradingSettings;
  account: Account;
  vix: number | null;
  btc_dominance_pct: number | null;
  funding_rate?: number | null;
  summary?: { errors: string[] };
};

export type CommitteeHookDeps = {
  createLlm?: () => CommitteeLlmClient;
  insertRun?: (result: CommitteeRunResult) => Promise<boolean>;
};

function runIdForError(ticket: OpportunityTicket): string {
  return createHash("sha256").update(`${ticket.id}|error|${Date.now()}`).digest("hex").slice(0, 16);
}

/** Minimal audit row when the pipeline throws or LLM is unavailable — fail-closed, no broker intent. */
export function buildCommitteeErrorRun(
  item: CommitteeHookItem,
  error: string,
  partial?: { latencyMs?: number },
): CommitteeRunResult {
  const cfg = getCommitteeConfig();
  const isTimeout = error.includes("TIMEOUT") || error.includes("timeout");
  const isLlmUnavailable = error.includes("missing_gemini") || error.includes("api_key") || error.includes("credit");
  return {
    runId: runIdForError(item.ticket),
    ticket: item.ticket,
    status: isTimeout ? "TIMEOUT" : isLlmUnavailable ? "SKIP" : "FAILED",
    outcome: "ERROR",
    shadow: cfg.shadow,
    wouldHaveExecuted: false,
    technical: null,
    fundamental: null,
    debate: null,
    softRisk: null,
    certificate: null,
    executionIntent: null,
    blocks: [],
    errors: [error.slice(0, 240)],
    injectionFlags: [],
    latencyMs: partial?.latencyMs ?? 0,
    modelVersions: { technical: "not_run", fundamental: "not_run", softRisk: "not_run" },
    promptVersions: { ...COMMITTEE_PROMPT_VERSIONS },
    triggerId: item.triggerId,
  };
}

async function persistHookResult(
  result: CommitteeRunResult,
  item: CommitteeHookItem,
  ctx: CommitteeHookContext,
  insertRun: (r: CommitteeRunResult) => Promise<boolean>,
): Promise<boolean> {
  const ok = await insertRun(result);
  if (!ok) {
    ctx.summary?.errors.push(`committee_persist ${item.ticket.symbol}: audit write failed`);
    return false;
  }
  if (ctx.summary && result.errors.length) {
    ctx.summary.errors.push(...result.errors.map((e) => `committee:${item.ticket.symbol}:${e}`).slice(0, 2));
  }
  const reflectionOk = await maybeRecordReflection(result);
  if (!reflectionOk && getCommitteeConfig().reflection) {
    ctx.summary?.errors.push(`committee_reflection ${item.ticket.symbol}: note write failed`);
  }
  return ok;
}

/**
 * Isolated shadow hook — runs top-K tickets through the committee and persists audits.
 * Does not alter baseline entry/fill paths; no-op when COMMITTEE_ENABLED is false.
 * Never throws — LLM / persist failures are fail-closed ERROR/SKIP audits.
 */
export async function runCommitteeShadowBatch(
  items: CommitteeHookItem[],
  ctx: CommitteeHookContext,
  deps: CommitteeHookDeps = {},
): Promise<number> {
  const cfg = getCommitteeConfig();
  if (!cfg.enabled || !items.length) return 0;

  const insertRun = deps.insertRun ?? insertCommitteeRunSafe;
  let runs = 0;

  try {
    const batch = [...items].sort((a, b) => b.ticket.score - a.ticket.score).slice(0, cfg.maxPerTick);
    const createLlmFn = deps.createLlm ?? createCommitteeLlm;
    let llmClient: CommitteeLlmClient;
    try {
      llmClient = createLlmFn();
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : "llm_init_failed";
      for (const item of batch) {
        const errorRun = buildCommitteeErrorRun(item, msg);
        if (await persistHookResult(errorRun, item, ctx, insertRun)) runs += 1;
      }
      return runs;
    }
    const envelope = envelopeFromAccount({
      equity: ctx.account.equity,
      peakEquity: Math.max(ctx.settings.peak_equity, ctx.account.equity),
      realizedToday: ctx.account.realizedToday,
      realizedWeek: ctx.account.realizedWeek,
      killSwitchActive: ctx.settings.kill_switch_active,
      entriesPaused: ctx.settings.entries_paused,
      openPositions: ctx.account.open,
    });
    const open_risk_r = ctx.account.open.reduce((s, t) => s + openRiskR(t.sim_state), 0);
    const portfolio = {
      open_risk_r,
      realized_r_today: ctx.account.realizedToday,
      realized_r_week: ctx.account.realizedWeek,
      drawdown_pct: drawdownFromPeak(ctx.account.equity, ctx.settings.peak_equity),
      open_positions: ctx.account.open.map((t) => ({ symbol: t.symbol, open_risk_r: openRiskR(t.sim_state) })),
    };

    for (const item of batch) {
      const t0 = Date.now();
      try {
        const input: CommitteeRunInput = {
          ticket: item.ticket,
          assetClass: item.assetClass,
          envelope,
          vetoes: item.vetoes,
          envelopeBlocks: item.envelopeBlocks,
          equity: ctx.account.equity,
          riskScale: ctx.settings.risk_scale,
          shadow: cfg.shadow,
          triggerId: item.triggerId,
          llm: llmClient,
          fundamental: {
            headlines: item.headlines ?? [],
            vix: ctx.vix,
            btc_dominance_pct: ctx.btc_dominance_pct,
            funding_rate: ctx.funding_rate ?? null,
            earnings_window: item.earningsWindow ?? false,
          },
          portfolio,
        };
        const result = await runCommitteeShadow(input);
        if (await persistHookResult(result, item, ctx, insertRun)) runs += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 200) : "committee_hook_error";
        const errorRun = buildCommitteeErrorRun(item, msg, { latencyMs: Date.now() - t0 });
        if (await persistHookResult(errorRun, item, ctx, insertRun)) runs += 1;
      }
    }
  } catch (err) {
    ctx.summary?.errors.push(`committee_shadow: ${err instanceof Error ? err.message.slice(0, 120) : "batch_failed"}`);
  }

  return runs;
}
