import { createHash } from "crypto";
import { z } from "zod";
import { RISK_ENVELOPE } from "../config";
import { snapMultiplier } from "../agent-judge";
import type { RiskMultiplier } from "../types";
import {
  analystReportSchema,
  debateSynthesisSchema,
  executionIntentSchema,
  opportunityTicketSchema,
  riskCertificateSchema,
  rawSoftRiskOpinionSchema,
  softRiskOpinionSchema,
  type AnalystReport,
  type DebateSynthesis,
  type ExecutionIntent,
  type OpportunityTicket,
  type RiskCertificate,
  type RawSoftRiskOpinion,
  type SoftRiskOpinion,
  type SoftRiskMultiplier,
} from "./types";

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.map(String).join(".") || "root"}: ${i.message}`).join("; ");
}

export function parseOpportunityTicket(input: unknown): ParseResult<OpportunityTicket> {
  const r = opportunityTicketSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: formatZodError(r.error) };
}

export function parseAnalystReport(input: unknown): ParseResult<AnalystReport> {
  const r = analystReportSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: formatZodError(r.error) };
}

export function parseDebateSynthesis(input: unknown): ParseResult<DebateSynthesis> {
  const r = debateSynthesisSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: formatZodError(r.error) };
}

export function parseRawSoftRiskOpinion(input: unknown): ParseResult<RawSoftRiskOpinion> {
  const r = rawSoftRiskOpinionSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: formatZodError(r.error) };
}

export function parseSoftRiskOpinion(input: unknown): ParseResult<SoftRiskOpinion> {
  const r = softRiskOpinionSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: formatZodError(r.error) };
}

export function parseRiskCertificate(input: unknown): ParseResult<RiskCertificate> {
  const r = riskCertificateSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: formatZodError(r.error) };
}

export function parseExecutionIntent(input: unknown): ParseResult<ExecutionIntent> {
  const r = executionIntentSchema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, error: formatZodError(r.error) };
}

/** Deterministic ticket id: symbol + strategy + bar close time (ISO). */
export function opportunityTicketId(symbol: string, strategy: string, barTimeIso: string): string {
  const raw = `${symbol.toUpperCase()}|${strategy}|${barTimeIso}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Snap multiplier DOWN to the allowed committee set — never increases risk. */
export function snapCommitteeMultiplier(x: unknown): SoftRiskMultiplier {
  return snapMultiplier(x) as SoftRiskMultiplier;
}

/** Allowed soft-risk multipliers (same as agent judge). */
export const COMMITTEE_RISK_MULTIPLIERS = RISK_ENVELOPE.AGENT_RISK_MULTIPLIERS;

/**
 * For LONG: a tightened stop must stay below entry and be closer to entry than the structural stop
 * (higher price). Invalid proposals are rejected — structural stop is kept.
 */
export function tightenStopForLong(input: {
  entry: number;
  structuralStop: number;
  proposedStop?: number | null;
}): { stop: number; tightened: boolean; note?: string } {
  const { entry, structuralStop } = input;
  const proposed = input.proposedStop;
  if (proposed === null || proposed === undefined || !Number.isFinite(proposed)) {
    return { stop: structuralStop, tightened: false };
  }
  if (proposed >= entry) {
    return { stop: structuralStop, tightened: false, note: "STOP_NOT_BELOW_ENTRY" };
  }
  if (proposed <= structuralStop) {
    return { stop: structuralStop, tightened: false, note: "STOP_NOT_TIGHTER_THAN_STRUCTURAL" };
  }
  return { stop: proposed, tightened: true };
}

export type EnforcedSoftRisk = SoftRiskOpinion & { enforcement_notes: string[] };

const FAIL_SOFT: EnforcedSoftRisk = {
  allow: false,
  risk_multiplier: 0,
  stop_policy: "KEEP",
  reasons: ["Soft risk unavailable — defaulted to deny (fail-closed)."],
  red_flags: [],
  enforcement_notes: ["FAIL_CLOSED_DENY"],
};

/**
 * Enforce soft-risk bounds in code: multiplier snaps down; deny forces zero;
 * stop may only tighten for LONG. Invalid schema → fail-closed deny.
 */
export function enforceSoftRiskOpinion(
  raw: unknown,
  ctx: { entry: number; structuralStop: number },
): EnforcedSoftRisk {
  const parsed = parseRawSoftRiskOpinion(raw);
  if (!parsed.ok) return { ...FAIL_SOFT, reasons: [`Schema invalid: ${parsed.error}`] };

  const notes: string[] = [];
  let allow = parsed.data.allow;
  let mult = snapCommitteeMultiplier(parsed.data.risk_multiplier);
  if (mult !== parsed.data.risk_multiplier) notes.push(`MULTIPLIER_SNAPPED(${parsed.data.risk_multiplier}→${mult})`);

  if (!allow && mult !== 0) {
    mult = 0;
    notes.push("DENY_FORCES_ZERO");
  }
  if (allow && mult === 0) {
    allow = false;
    notes.push("ZERO_MULTIPLIER_IS_DENY");
  }

  let stop_policy = parsed.data.stop_policy;
  let tightened_stop = parsed.data.tightened_stop;
  if (stop_policy === "TIGHTEN") {
    const t = tightenStopForLong({ entry: ctx.entry, structuralStop: ctx.structuralStop, proposedStop: tightened_stop });
    if (!t.tightened) {
      stop_policy = "KEEP";
      tightened_stop = undefined;
      notes.push(t.note ?? "TIGHTEN_REJECTED");
    } else {
      tightened_stop = t.stop;
    }
  } else if (tightened_stop !== undefined) {
    tightened_stop = undefined;
    notes.push("IGNORED_TIGHTENED_STOP_WHEN_KEEP");
  }

  return {
    ...parsed.data,
    allow,
    risk_multiplier: mult,
    stop_policy,
    tightened_stop,
    enforcement_notes: notes,
  };
}

/** Risk certificate is valid for execution only when ok=true and market is OPEN. */
export function certificatePermitsExecution(cert: RiskCertificate): boolean {
  return cert.ok && cert.market_state === "OPEN" && cert.final_qty > 0;
}

/** Map enforced soft multiplier to the shared RiskMultiplier type. */
export function softToRiskMultiplier(mult: SoftRiskMultiplier): RiskMultiplier {
  return mult as RiskMultiplier;
}
