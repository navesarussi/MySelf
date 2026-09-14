import { EXECUTION_RULES, RISK_ENVELOPE } from "./config";
import type { AssetClass, Bar, ExitPlan, ExitReason, PositionState } from "./types";

/**
 * Position state machine (stage 7) + paper/backtest fill model (stage 8).
 * Pure and bar-driven: the backtester and the live paper engine step positions through
 * the same function so their results are directly comparable.
 *
 * Conservative intra-bar assumptions: when a bar touches both stop and 1R, the stop wins;
 * after the partial exit no further events are processed on that same bar.
 */
export type SimPosition = {
  state: PositionState;
  asset_class: AssetClass;
  /** Take 50% at 1R and move stop to entry. false = NO_PARTIAL backtest variant (full size to 2R). */
  use_partial: boolean;
  entry_limit: number;
  entry_price: number | null;
  stop_price: number;
  target_price: number;
  /** 1R price distance, fixed at fill. */
  stop_distance: number;
  initial_size: number;
  size: number;
  exit_plan: ExitPlan | null;
  trail_stop: number | null;
  reached_1r: boolean;
  partial_exit_price: number | null;
  exit_price: number | null;
  exit_reason: ExitReason | null;
  gapped_through_stop: boolean;
  entry_slippage_bps: number | null;
  cash_flow: number;
  fees_paid: number;
  mfe_r: number;
  mae_r: number;
  bars_held: number;
  pending_bars: number;
  opened_at: number | null;
  closed_at: number | null;
  cancel_reason: string | null;
  /** STRUCTURAL plan (strategy v2) — optional so v1 rows stay valid. */
  partial_fraction?: number;
  breakeven_at_r?: number;
  trail_after_r?: number | null;
  trail_mult?: number;
  peak_price?: number;
  target_extensions?: number;
  initial_target_price?: number;
};

export type StepContext = {
  /** ATR(14) at this bar (entry timeframe) — used for trailing. */
  atr: number;
  /** Trailing stop distance in ATRs (strategy param). */
  trail_atr_mult?: number;
  /** Daily close below EMA200 on this bar → regime flip exit. */
  regime_flip?: boolean;
  /** Forced exit at close (earnings ahead for stocks). */
  force_exit_reason?: ExitReason;
  /** Decided at the PREVIOUS bar close (no look-ahead). Target may only rise; stop only ratchets up. */
  raise_target_to?: number;
  raise_stop_to?: number;
};

export type PositionEvent =
  | { type: "FILLED"; price: number; at: number }
  | { type: "CANCELLED"; reason: string; at: number }
  | { type: "PARTIAL_1R"; price: number; at: number }
  | { type: "STOP_MOVED"; from: number; to: number; at: number }
  | { type: "CLOSED"; price: number; reason: ExitReason; at: number }
  | { type: "TARGET_EXTENDED"; from: number; to: number; at: number };

export function newPendingPosition(input: {
  asset_class: AssetClass;
  entry: number;
  stop: number;
  size: number;
  use_partial?: boolean;
}): SimPosition {
  const stopDistance = input.entry - input.stop;
  return {
    state: "PENDING",
    asset_class: input.asset_class,
    use_partial: input.use_partial ?? true,
    entry_limit: input.entry,
    entry_price: null,
    stop_price: input.stop,
    target_price: input.entry + RISK_ENVELOPE.MIN_RR_RATIO * stopDistance,
    stop_distance: stopDistance,
    initial_size: input.size,
    size: input.size,
    exit_plan: null,
    trail_stop: null,
    reached_1r: false,
    partial_exit_price: null,
    exit_price: null,
    exit_reason: null,
    gapped_through_stop: false,
    entry_slippage_bps: null,
    cash_flow: 0,
    fees_paid: 0,
    mfe_r: 0,
    mae_r: 0,
    bars_held: 0,
    pending_bars: 0,
    opened_at: null,
    closed_at: null,
    cancel_reason: null,
  };
}

/** Iron rule: a stop never moves toward the loss. Returns the stop actually in force. */
export function ratchetStop(current: number, proposed: number): number {
  return proposed > current ? proposed : current;
}

export function realizedR(p: SimPosition): number {
  const risk = p.initial_size * p.stop_distance;
  return risk > 0 ? p.cash_flow / risk : 0;
}

/** Open risk in R: a position with the stop at/above entry carries no risk. */
export function openRiskR(p: Pick<SimPosition, "state" | "entry_price" | "stop_price">): number {
  if (p.state === "PENDING") return 1;
  if (p.state !== "OPEN") return 0;
  return p.entry_price !== null && p.stop_price >= p.entry_price ? 0 : 1;
}

function fee(p: SimPosition, price: number, size: number) {
  return EXECUTION_RULES.FEE_RATE[p.asset_class] * price * size;
}

function sell(p: SimPosition, price: number, size: number) {
  const f = fee(p, price, size);
  p.cash_flow += price * size - f;
  p.fees_paid += f;
  p.size = Math.max(0, p.size - size);
}

function close(p: SimPosition, price: number, reason: ExitReason, at: number, events: PositionEvent[]) {
  sell(p, price, p.size);
  p.exit_price = price;
  p.exit_reason = reason;
  p.state = "CLOSED";
  p.closed_at = at;
  events.push({ type: "CLOSED", price, reason, at });
}

function trackExcursion(p: SimPosition, bar: Bar) {
  if (p.entry_price === null || p.stop_distance <= 0) return;
  p.mfe_r = Math.max(p.mfe_r, (bar.h - p.entry_price) / p.stop_distance);
  p.mae_r = Math.min(p.mae_r, (bar.l - p.entry_price) / p.stop_distance);
}

/** Limit-order fill for a PENDING position. Mutates `p`. */
function tryFill(p: SimPosition, bar: Bar, events: PositionEvent[]): "open" | "intrabar" | null {
  const slip = EXECUTION_RULES.ASSUMED_SLIPPAGE[p.asset_class];
  // Setup invalidated before we got in.
  if (bar.o <= p.stop_price) {
    p.state = "CANCELLED";
    p.cancel_reason = "GAP_BELOW_STOP";
    p.closed_at = bar.t;
    events.push({ type: "CANCELLED", reason: p.cancel_reason, at: bar.t });
    return null;
  }
  let raw: number | null = null;
  let how: "open" | "intrabar" | null = null;
  if (bar.o <= p.entry_limit) {
    raw = bar.o;
    how = "open";
  } else if (bar.l <= p.entry_limit) {
    raw = p.entry_limit;
    how = "intrabar";
  }
  if (raw === null || how === null) {
    p.pending_bars += 1;
    if (p.pending_bars >= EXECUTION_RULES.PENDING_EXPIRY_BARS) {
      const runaway = bar.l > p.entry_limit * (1 + EXECUTION_RULES.MAX_ENTRY_SLIPPAGE);
      p.state = "CANCELLED";
      p.cancel_reason = runaway ? "SLIPPAGE_EXCEEDED" : "NOT_FILLED";
      p.closed_at = bar.t;
      events.push({ type: "CANCELLED", reason: p.cancel_reason, at: bar.t });
    }
    return null;
  }
  const price = raw * (1 + slip);
  const slippage = price / p.entry_limit - 1;
  if (slippage > EXECUTION_RULES.MAX_ENTRY_SLIPPAGE) {
    p.state = "CANCELLED";
    p.cancel_reason = "SLIPPAGE_EXCEEDED";
    p.closed_at = bar.t;
    events.push({ type: "CANCELLED", reason: p.cancel_reason, at: bar.t });
    return null;
  }
  const f = fee(p, price, p.size);
  p.cash_flow -= price * p.size + f;
  p.fees_paid += f;
  p.entry_price = price;
  p.entry_slippage_bps = Math.round(slippage * 10_000);
  // Stop stays where the chart put it; keep exact 2:1 from the actual fill.
  p.stop_distance = price - p.stop_price;
  // v1 keeps an exact 2:1 from the fill; v2 keeps its structural target (already validated ≥ 2R).
  if (p.exit_plan !== "STRUCTURAL") p.target_price = price + RISK_ENVELOPE.MIN_RR_RATIO * p.stop_distance;
  p.state = "OPEN";
  p.opened_at = bar.t;
  events.push({ type: "FILLED", price, at: bar.t });
  return how;
}

/** Advance one closed bar. Returns lifecycle events (for the journal). */
export function stepPosition(p: SimPosition, bar: Bar, ctx: StepContext): PositionEvent[] {
  const events: PositionEvent[] = [];
  if (p.state === "CLOSED" || p.state === "CANCELLED") return events;
  const slip = EXECUTION_RULES.ASSUMED_SLIPPAGE[p.asset_class];

  let fillKind: "open" | "intrabar" | null = null;
  if (p.state === "PENDING") {
    fillKind = tryFill(p, bar, events);
    if (!fillKind) return events;
  }
  if (p.entry_price === null) return events;

  if (p.exit_plan === "STRUCTURAL") {
    stepStructural(p, bar, ctx, events, fillKind);
    return events;
  }

  p.bars_held += 1;
  trackExcursion(p, bar);
  const entry = p.entry_price;
  const oneR = entry + p.stop_distance;

  if (p.state === "OPEN") {
    // Gap through the stop: filled at the open, worse than the stop.
    if (fillKind !== "intrabar" && bar.o <= p.stop_price) {
      p.gapped_through_stop = true;
      close(p, bar.o * (1 - slip), "STOP", bar.t, events);
      return events;
    }
    if (bar.l <= p.stop_price) {
      close(p, p.stop_price * (1 - slip), "STOP", bar.t, events);
      return events;
    }
    if (fillKind === "intrabar") {
      applyCloseRules(p, bar, ctx, events, slip);
      return events;
    }
    if (p.use_partial && bar.h >= oneR) {
      const price = Math.max(bar.o, oneR);
      p.reached_1r = true;
      p.partial_exit_price = price;
      sell(p, price, p.initial_size / 2);
      events.push({ type: "PARTIAL_1R", price, at: bar.t });
      const before = p.stop_price;
      p.stop_price = ratchetStop(p.stop_price, entry);
      events.push({ type: "STOP_MOVED", from: before, to: p.stop_price, at: bar.t });
      p.state = "RISK_FREE";
      if (!p.exit_plan) p.exit_plan = "TARGET_2R";
      p.trail_stop = p.stop_price;
      return events;
    }
    if (!p.use_partial) {
      if (bar.h >= oneR) p.reached_1r = true;
      if (bar.h >= p.target_price) {
        close(p, Math.max(bar.o, p.target_price), "TARGET", bar.t, events);
        return events;
      }
    }
    applyCloseRules(p, bar, ctx, events, slip);
    return events;
  }

  if (p.state === "RISK_FREE") {
    const plan = p.exit_plan ?? "TARGET_2R";
    const stop = plan === "TRAIL_2ATR" ? Math.max(p.trail_stop ?? entry, p.stop_price) : p.stop_price;
    const stopReason: ExitReason = stop > entry ? "TRAIL" : "BREAKEVEN";
    if (bar.o <= stop) {
      p.gapped_through_stop = bar.o < stop;
      close(p, bar.o * (1 - slip), stopReason, bar.t, events);
      return events;
    }
    if (bar.l <= stop) {
      close(p, stop * (1 - slip), stopReason, bar.t, events);
      return events;
    }
    if (plan === "TARGET_2R" && bar.h >= p.target_price) {
      close(p, Math.max(bar.o, p.target_price), "TARGET", bar.t, events);
      return events;
    }
    if (applyCloseRules(p, bar, ctx, events, slip)) return events;
    if (plan === "TRAIL_2ATR" && Number.isFinite(ctx.atr)) {
      const proposed = bar.c - ctx.atr * (ctx.trail_atr_mult ?? 2);
      const next = ratchetStop(p.trail_stop ?? entry, Math.max(proposed, entry));
      if (next !== p.trail_stop) {
        events.push({ type: "STOP_MOVED", from: p.trail_stop ?? entry, to: next, at: bar.t });
        p.trail_stop = next;
        p.stop_price = ratchetStop(p.stop_price, next);
      }
    }
  }
  return events;
}

/**
 * Strategy v2 management:
 *  - before `breakeven_at_r` nothing changes (stop/target locked);
 *  - at breakeven_at_r: optional partial (partial_fraction), stop → entry;
 *  - after trail_after_r: chandelier trail = peak − trail_mult × ATR (ratchet only);
 *  - target may be raised (never lowered) by a decision taken at the previous close.
 */
function stepStructural(p: SimPosition, bar: Bar, ctx: StepContext, events: PositionEvent[], fillKind: "open" | "intrabar" | null) {
  const slip = EXECUTION_RULES.ASSUMED_SLIPPAGE[p.asset_class];
  const entry = p.entry_price!;
  const R = p.stop_distance;

  // Decisions from the previous bar close apply before this bar trades.
  if (ctx.raise_target_to !== undefined && ctx.raise_target_to > p.target_price && p.state !== "PENDING") {
    events.push({ type: "TARGET_EXTENDED", from: p.target_price, to: ctx.raise_target_to, at: bar.t });
    p.target_price = ctx.raise_target_to;
    p.target_extensions = (p.target_extensions ?? 0) + 1;
  }
  if (ctx.raise_stop_to !== undefined && ctx.raise_stop_to > p.stop_price && ctx.raise_stop_to < bar.o) {
    events.push({ type: "STOP_MOVED", from: p.stop_price, to: ctx.raise_stop_to, at: bar.t });
    p.stop_price = ratchetStop(p.stop_price, ctx.raise_stop_to);
  }

  p.bars_held += 1;
  trackExcursion(p, bar);
  const riskFree = p.stop_price >= entry;
  const stopReason: ExitReason = p.stop_price > entry + 1e-12 ? "TRAIL" : riskFree ? "BREAKEVEN" : "STOP";

  if (fillKind !== "intrabar" && bar.o <= p.stop_price) {
    p.gapped_through_stop = bar.o < p.stop_price;
    close(p, bar.o * (1 - slip), stopReason, bar.t, events);
    return;
  }
  if (bar.l <= p.stop_price) {
    close(p, p.stop_price * (1 - slip), stopReason, bar.t, events);
    return;
  }
  if (fillKind === "intrabar") {
    applyCloseRules(p, bar, ctx, events, slip);
    return;
  }
  if (bar.h >= p.target_price) {
    close(p, Math.max(bar.o, p.target_price), "TARGET", bar.t, events);
    return;
  }

  const beAt = entry + (p.breakeven_at_r ?? 1) * R;
  if (bar.h >= entry + R) p.reached_1r = true;
  if (p.state === "OPEN" && bar.h >= beAt) {
    const frac = p.partial_fraction ?? 0;
    if (frac > 0) {
      const price = Math.max(bar.o, beAt);
      p.partial_exit_price = price;
      sell(p, price, p.initial_size * frac);
      events.push({ type: "PARTIAL_1R", price, at: bar.t });
    }
    const before = p.stop_price;
    p.stop_price = ratchetStop(p.stop_price, entry);
    events.push({ type: "STOP_MOVED", from: before, to: p.stop_price, at: bar.t });
    p.state = "RISK_FREE";
    return;
  }

  if (applyCloseRules(p, bar, ctx, events, slip)) return;

  // Chandelier trail once the trade has earned its room.
  p.peak_price = Math.max(p.peak_price ?? entry, bar.h);
  if (p.trail_after_r !== null && p.trail_after_r !== undefined && p.peak_price >= entry + p.trail_after_r * R && Number.isFinite(ctx.atr)) {
    const proposed = Math.max(entry, p.peak_price - (p.trail_mult ?? 3) * ctx.atr);
    if (proposed > p.stop_price && proposed < bar.c) {
      events.push({ type: "STOP_MOVED", from: p.stop_price, to: proposed, at: bar.t });
      p.stop_price = ratchetStop(p.stop_price, proposed);
      p.trail_stop = p.stop_price;
      if (p.state === "OPEN") p.state = "RISK_FREE";
    }
  }
}

function applyCloseRules(p: SimPosition, bar: Bar, ctx: StepContext, events: PositionEvent[], slip: number): boolean {
  if (ctx.regime_flip) {
    close(p, bar.c * (1 - slip), "REGIME_FLIP", bar.t, events);
    return true;
  }
  if (ctx.force_exit_reason) {
    close(p, bar.c * (1 - slip), ctx.force_exit_reason, bar.t, events);
    return true;
  }
  return false;
}

/** Emergency/manual exit at a market price (kill switch, confirmed chat command). */
export function forceClose(p: SimPosition, price: number, reason: ExitReason, at: number): PositionEvent[] {
  const events: PositionEvent[] = [];
  if (p.state === "PENDING") {
    p.state = "CANCELLED";
    p.cancel_reason = reason;
    p.closed_at = at;
    events.push({ type: "CANCELLED", reason, at });
    return events;
  }
  if (p.state !== "OPEN" && p.state !== "RISK_FREE") return events;
  close(p, price * (1 - EXECUTION_RULES.ASSUMED_SLIPPAGE[p.asset_class]), reason, at, events);
  return events;
}
