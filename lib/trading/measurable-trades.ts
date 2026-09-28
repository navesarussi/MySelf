import { R_MEASUREMENT } from "./config";
import { entryConfirmedAtBroker } from "./broker/reconcile-decisions";
import { isAccountTrade, type TradeRow } from "./store";
import type { TradingPhase } from "./types";

/** Fields the clean-set predicate and floored-R helpers need. */
export type MeasurableTradeFields = Pick<
  TradeRow,
  | "track"
  | "execution"
  | "broker"
  | "reconciliation_kind"
  | "broker_settled_at"
  | "exit_price_confirmed"
  | "entry_price"
  | "broker_filled_qty"
  | "state"
  | "realized_r"
  | "realized_pnl"
  | "initial_stop_price"
  | "position_size"
> & {
  sim_state?: { opened_at: number | null; state: string; entry_price?: number | null; initial_size?: number };
};

/** Per-share stop distance with a pct (and optional ATR) floor for R denominators. */
export function flooredStopDistance(input: { entry_price: number; stop_price: number; atr?: number | null }): number {
  const raw = Math.abs(input.entry_price - input.stop_price);
  const pctFloor = input.entry_price * R_MEASUREMENT.MIN_STOP_DISTANCE_PCT;
  const atrFloor = input.atr && input.atr > 0 ? input.atr * R_MEASUREMENT.MIN_STOP_ATR_FRACTION : 0;
  return Math.max(raw, pctFloor, atrFloor);
}

/** USD risk denominator for R = P&L / risk, with the measurement floor applied. */
export function flooredRiskUsd(input: { entry_price: number; stop_price: number; size: number; atr?: number | null }): number {
  return flooredStopDistance(input) * input.size;
}

/**
 * Strategy-measurable trade: broker-confirmed fills, no reconciliation row, no
 * estimated/unconfirmed manual exit. Builds on {@link isAccountTrade} but excludes
 * every `reconciliation_kind` and unconfirmed exits. Account equity and halts
 * still use {@link isAccountTrade} + broker P&L.
 */
export function isMeasurableTrade(t: MeasurableTradeFields, phase: TradingPhase): boolean {
  if (!isAccountTrade(t, phase)) return false;
  if (t.reconciliation_kind != null && t.reconciliation_kind !== "") return false;
  if (t.exit_price_confirmed === false) return false;
  if (t.state !== "CLOSED") return false;
  if (t.realized_pnl === null) return false;

  if (phase === "PAPER" || phase === "LIVE") {
    return Boolean(t.broker_settled_at);
  }

  const sim = t.sim_state ?? { opened_at: null, state: t.state };
  if (!entryConfirmedAtBroker({ entry_price: t.entry_price, broker_filled_qty: t.broker_filled_qty, sim_state: sim })) {
    return false;
  }
  return t.realized_r !== null;
}

/** R-multiple for metrics, recomputed with the risk floor when P&L and levels are known. */
export function measurableR(t: MeasurableTradeFields): number {
  const entry = t.entry_price ?? t.sim_state?.entry_price ?? null;
  const stop = t.initial_stop_price;
  const size = t.sim_state?.initial_size ?? t.position_size;
  const pnl = t.realized_pnl;
  if (entry === null || !(stop > 0) || !(size > 0) || pnl === null) return t.realized_r ?? 0;
  const risk = flooredRiskUsd({ entry_price: entry, stop_price: stop, size });
  if (!(risk > 0)) return t.realized_r ?? 0;
  return Math.round((pnl / risk) * 1000) / 1000;
}

export function partitionMeasurableTrades<T extends MeasurableTradeFields>(
  trades: T[],
  phase: TradingPhase
): { measurable: T[]; excluded: T[] } {
  const measurable: T[] = [];
  const excluded: T[] = [];
  for (const t of trades) {
    (isMeasurableTrade(t, phase) ? measurable : excluded).push(t);
  }
  return { measurable, excluded };
}

export type RTradeFromRow = { r: number; closed_at: number; reached_1r?: boolean; exit_reason?: string | null };

/** Closed rows → R series for {@link computeStats}, filtered and floored. */
export function toMeasurableRTrades<T extends MeasurableTradeFields & { closed_at?: string | null; created_at?: string; reached_1r?: boolean; exit_reason?: string | null }>(
  trades: T[],
  phase: TradingPhase
): (T & RTradeFromRow)[] {
  return trades
    .filter((t) => isMeasurableTrade(t, phase))
    .map((t) => ({
      ...t,
      r: measurableR(t),
      closed_at: Date.parse(t.closed_at ?? t.created_at ?? ""),
    }));
}
