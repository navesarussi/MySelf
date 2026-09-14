import { RISK_ENVELOPE } from "./config";

/** Stage 2 — portfolio-level envelope. Pure checks; callers must honour every rejection. */

export type EnvelopePosition = {
  symbol: string;
  notional: number;
  open_risk_r: number;
};

export type EnvelopeState = {
  equity: number;
  peak_equity: number;
  realized_r_today: number;
  realized_r_week: number;
  kill_switch_active: boolean;
  entries_paused: boolean;
  positions: EnvelopePosition[];
};

export type EnvelopeBlock =
  | "KILL_SWITCH"
  | "ENTRIES_PAUSED"
  | "DAILY_LOSS_HALT"
  | "WEEKLY_LOSS_HALT"
  | "MAX_CONCURRENT"
  | "MAX_OPEN_RISK"
  | "MAX_CORRELATED"
  | "ALREADY_IN_SYMBOL";

export function drawdownFromPeak(equity: number, peak: number): number {
  if (!(peak > 0)) return 0;
  return Math.max(0, 1 - equity / peak);
}

export function shouldTripKillSwitch(equity: number, peak: number): boolean {
  return drawdownFromPeak(equity, peak) >= RISK_ENVELOPE.MASTER_KILL_SWITCH_DD;
}

export function haltStatus(state: Pick<EnvelopeState, "realized_r_today" | "realized_r_week">) {
  return {
    daily: state.realized_r_today <= RISK_ENVELOPE.DAILY_LOSS_HALT_R,
    weekly: state.realized_r_week <= RISK_ENVELOPE.WEEKLY_LOSS_HALT_R,
  };
}

/**
 * Can a new position in `symbol` be opened? `correlatedWith` = open symbols whose return
 * correlation with the candidate exceeds the threshold (computed by the caller, cross-asset).
 */
export function checkNewEntry(state: EnvelopeState, symbol: string, correlatedWith: string[]): EnvelopeBlock[] {
  const blocks: EnvelopeBlock[] = [];
  if (state.kill_switch_active || shouldTripKillSwitch(state.equity, state.peak_equity)) blocks.push("KILL_SWITCH");
  if (state.entries_paused) blocks.push("ENTRIES_PAUSED");
  const halts = haltStatus(state);
  if (halts.daily) blocks.push("DAILY_LOSS_HALT");
  if (halts.weekly) blocks.push("WEEKLY_LOSS_HALT");
  if (state.positions.length >= RISK_ENVELOPE.MAX_CONCURRENT_POSITIONS) blocks.push("MAX_CONCURRENT");
  const openRisk = state.positions.reduce((s, p) => s + p.open_risk_r, 0);
  if (openRisk + 1 > RISK_ENVELOPE.MAX_TOTAL_OPEN_RISK_R) blocks.push("MAX_OPEN_RISK");
  if (state.positions.some((p) => p.symbol === symbol)) blocks.push("ALREADY_IN_SYMBOL");
  const correlatedOpen = state.positions.filter((p) => correlatedWith.includes(p.symbol)).length;
  // Candidate + correlated open positions may not exceed the cap.
  if (correlatedOpen + 1 > RISK_ENVELOPE.MAX_CORRELATED_POSITIONS) blocks.push("MAX_CORRELATED");
  return blocks;
}

/**
 * Live risk scale: lowering is instant; raising is deferred (friction by design) —
 * a raise only takes effect after a cooldown and never while a halt is active.
 */
export const RISK_SCALE_RAISE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function applyRiskScaleRequest(input: {
  current: number;
  requested: number;
  now: number;
}): { scale: number; pending: { value: number; effective_at: number } | null } {
  const requested = Math.min(1, Math.max(0, input.requested));
  if (requested <= input.current) return { scale: requested, pending: null };
  return { scale: input.current, pending: { value: requested, effective_at: input.now + RISK_SCALE_RAISE_COOLDOWN_MS } };
}

/** Week key (ISO Monday date, UTC) used for the weekly halt. */
export function weekStartIso(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}
