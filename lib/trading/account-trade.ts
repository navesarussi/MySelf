import type { TradingPhase } from "./types";

/** Minimal trade shape for account / measurable predicates — no DB imports. */
export type AccountTradeFields = {
  track: string;
  execution: string;
  broker?: string | null;
  reconciliation_kind?: string | null;
};

/**
 * The "account" whose equity sizes positions and trips breakers. In PAPER that is the Alpaca demo
 * account, so only trades that actually went to the broker count — a row the simulator filled on
 * its own once sized, halted and showed P&L as if it were money (2026-09: 86 such trades).
 * In SHADOW (pre-broker phase) it is the virtual account.
 */
export function isAccountTrade(t: AccountTradeFields, phase: TradingPhase) {
  // Rows reconciliation created (orphan closes) or closed without fills are not strategy trades. A real trade
  // whose quantity was synced or that reconciliation closed from fills still is — excluding those pushed live
  // book positions out of the account (2026-09-28).
  if (t.reconciliation_kind === "orphan_close" || t.reconciliation_kind === "journal_flat_unknown") return false;
  if (t.track !== "AGENT") return false;
  if (phase === "PAPER" || phase === "LIVE") return (t.execution === "PAPER" || t.execution === "LIVE") && Boolean(t.broker);
  return t.execution === "SHADOW";
}
