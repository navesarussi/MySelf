import { isAccountTrade } from "./account-trade";
import { entryConfirmedAtBroker } from "./broker/reconcile-decisions";
import { flooredRiskUsd, rFromPnl } from "./r-measurement";
import type { TradingPhase } from "./types";

/** Fields the clean-set predicate and floored-R helpers need. */
export type MeasurableTradeFields = {
  track: string;
  execution: string;
  broker?: string | null;
  reconciliation_kind?: string | null;
  broker_settled_at?: string | null;
  exit_price_confirmed?: boolean | null;
  entry_price: number | null;
  broker_filled_qty: number | null;
  state: string;
  realized_r: number | null;
  realized_pnl: number | null;
  initial_stop_price: number;
  position_size: number;
  sim_state?: { opened_at: number | null; state: string; entry_price?: number | null; initial_size?: number };
};

export { flooredStopDistance, flooredRiskUsd } from "./r-measurement";

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
  const size = t.sim_state?.initial_size ?? t.position_size;
  return (
    rFromPnl({
      entry_price: entry,
      initial_stop_price: t.initial_stop_price,
      position_size: size,
      realized_pnl: t.realized_pnl,
      realized_r: t.realized_r,
    }) ?? t.realized_r ?? 0
  );
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
export function toMeasurableRTrades<
  T extends MeasurableTradeFields & { closed_at?: string | null; created_at?: string; reached_1r?: boolean; exit_reason?: string | null },
>(trades: T[], phase: TradingPhase): (T & RTradeFromRow)[] {
  return trades
    .filter((t) => isMeasurableTrade(t, phase))
    .map((t) => ({
      ...t,
      r: measurableR(t),
      closed_at: Date.parse(t.closed_at ?? t.created_at ?? ""),
    }));
}
