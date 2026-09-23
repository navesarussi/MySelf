import type { EnvelopeBlock } from "../risk-envelope";
import { opportunityTicketId } from "./ids";
import type {
  DebateSynthesis,
  ExecutionIntent,
  OpportunityTicket,
  RiskCertificate,
} from "./types";

/** Known hard-risk block codes (envelope + market/sizing gates). Adapters may add more strings. */
export type RiskCertificateBlock = EnvelopeBlock | "MIN_RR" | "MARKET_STATE" | "BUYING_POWER" | "VETO" | "INVALID_GEOMETRY";

export type InvariantResult = { ok: true } | { ok: false; issues: string[] };

function fail(issues: string[]): InvariantResult {
  return { ok: false, issues };
}

/** LONG ticket geometry: structural stop below entry; every target at or above min RR vs stop distance. */
export function checkOpportunityTicketInvariants(ticket: OpportunityTicket): InvariantResult {
  const issues: string[] = [];
  const expectedId = opportunityTicketId(ticket.symbol, ticket.strategy, ticket.bar_time);
  if (ticket.id !== expectedId) issues.push(`id mismatch: got ${ticket.id}, expected ${expectedId}`);

  if (!(ticket.stop < ticket.entry)) issues.push("stop must be below entry for LONG");
  const risk = ticket.entry - ticket.stop;
  if (!(risk > 0)) issues.push("stop distance must be positive");

  for (const [i, t] of ticket.target_menu.entries()) {
    if (!(t.price > ticket.entry)) issues.push(`target_menu[${i}].price must be above entry`);
    const rr = (t.price - ticket.entry) / risk;
    if (rr + 1e-9 < t.rr) issues.push(`target_menu[${i}].rr (${t.rr}) exceeds geometry (${rr.toFixed(4)})`);
  }

  return issues.length ? fail(issues) : { ok: true };
}

/** Fail-closed certificate: UNKNOWN/HALTED/CLOSED cannot be ok; approved certs need valid LONG geometry. */
export function checkRiskCertificateInvariants(cert: RiskCertificate): InvariantResult {
  const issues: string[] = [];

  if (cert.market_state === "UNKNOWN" && cert.ok) issues.push("ok cannot be true when market_state is UNKNOWN");
  if (cert.market_state !== "OPEN" && cert.ok) issues.push("ok requires market_state OPEN");

  if (cert.ok) {
    if (!(cert.final_qty > 0)) issues.push("ok certificate requires final_qty > 0");
    if (!(cert.final_stop < cert.final_entry)) issues.push("final_stop must be below final_entry for LONG");
    if (!(cert.final_target > cert.final_entry)) issues.push("final_target must be above final_entry for LONG");
  }

  return issues.length ? fail(issues) : { ok: true };
}

export function checkExecutionIntentInvariants(intent: ExecutionIntent): InvariantResult {
  const issues: string[] = [];
  if (intent.order_type === "LIMIT" && intent.limit_price === undefined) {
    issues.push("LIMIT order requires limit_price");
  }
  if (intent.order_type === "MARKET" && intent.limit_price !== undefined) {
    issues.push("MARKET order must not include limit_price");
  }
  if (!(intent.stop < intent.target)) issues.push("stop must be below target for LONG");
  return issues.length ? fail(issues) : { ok: true };
}

/**
 * Facilitator default from architecture: SPLIT with low conviction → SKIP.
 * Orchestration may override; this is the conservative code default only.
 */
export function debateDefaultAction(synthesis: DebateSynthesis): "ENTER" | "SKIP" {
  if (synthesis.winner === "SPLIT" && synthesis.conviction <= 2) return "SKIP";
  return synthesis.recommended_action;
}
