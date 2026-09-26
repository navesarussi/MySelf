import { alpaca, ensureProtectiveStop } from "./broker/alpaca";
import { livePrice } from "./intraday-data";
import { providerSymbolFor } from "./intraday-universe";
import { getOpenTrades, simColumns, updateTrade, type TradeRow } from "./store";

/**
 * Manual edit of an open position's protective levels (the trade card's "edit" — the user is the trader).
 * Long only: the stop must sit below the market and the target above it. The initial stop — what R is
 * measured against — never changes; only the live protective levels do, at the broker and in the journal.
 */

/** A target this far out means "no fixed target — let the exit rules decide". */
export const NO_TARGET_R = 1000;

export type LevelEdit = { stop?: number; target?: number | null };

export type ValidatedEdit = { stop: number; target: number; changed: { stop: boolean; target: boolean } };

export class TradeEditError extends Error {}

export function validateLevelEdit(input: {
  state: TradeRow["state"];
  entry: number | null;
  stop: number;
  target: number;
  stopDistance: number;
  live: number | null;
  edit: LevelEdit;
}): ValidatedEdit {
  if (input.state !== "OPEN" && input.state !== "RISK_FREE") throw new TradeEditError("trade_not_open");
  if (input.entry === null) throw new TradeEditError("no_fill_yet");
  const ref = input.live ?? input.entry;
  let stop = input.stop;
  let target = input.target;
  if (input.edit.stop !== undefined) {
    if (!(input.edit.stop > 0) || !Number.isFinite(input.edit.stop)) throw new TradeEditError("invalid_stop");
    // A stop at/above the market would fire (or be rejected) the moment it reaches the broker.
    if (input.edit.stop >= ref) throw new TradeEditError("stop_above_price");
    stop = input.edit.stop;
  }
  if (input.edit.target !== undefined) {
    if (input.edit.target === null) target = input.entry + NO_TARGET_R * Math.max(input.stopDistance, input.entry * 0.001);
    else {
      if (!(input.edit.target > 0) || !Number.isFinite(input.edit.target)) throw new TradeEditError("invalid_target");
      if (input.edit.target <= ref) throw new TradeEditError("target_below_price");
      target = input.edit.target;
    }
  }
  if (!(target > stop)) throw new TradeEditError("target_below_stop");
  return { stop, target, changed: { stop: stop !== input.stop, target: target !== input.target } };
}

/** Apply a validated edit: the broker's protective orders first, then the journal. */
export async function editTradeLevels(tradeId: string, edit: LevelEdit, now = Date.now()): Promise<TradeRow> {
  const trade = (await getOpenTrades()).find((t) => t.id === tradeId);
  if (!trade) throw new TradeEditError("trade_not_open");
  const p = { ...trade.sim_state };
  const live = await livePrice({ symbol: trade.symbol, asset_class: trade.asset_class, provider_symbol: providerSymbolFor(trade.symbol, trade.asset_class) }).catch(() => null);
  const v = validateLevelEdit({ state: p.state, entry: p.entry_price, stop: p.stop_price, target: p.target_price, stopDistance: p.stop_distance, live, edit });
  const patch: Record<string, unknown> = {};

  if (trade.broker && v.changed.stop) {
    const stopOrder = trade.broker_stop_order_id ? await alpaca.getOrder(trade.broker_stop_order_id).catch(() => null) : null;
    const live_ = stopOrder && !["filled", "canceled", "expired", "rejected"].includes(stopOrder.status);
    if (live_) {
      const replaced = await alpaca.replaceOrder(stopOrder.id, trade.asset_class === "STOCK" ? { stop_price: v.stop } : { stop_price: v.stop, limit_price: v.stop * 0.99 }, trade.asset_class);
      patch.broker_stop_order_id = replaced.id;
    } else {
      const placed = await ensureProtectiveStop({ tradeId: trade.id, symbol: trade.symbol, assetClass: trade.asset_class, qty: p.size, stop: v.stop, now });
      if (placed) patch.broker_stop_order_id = placed.id;
    }
  }
  if (trade.broker && v.changed.target && trade.broker_target_order_id) {
    const targetOrder = await alpaca.getOrder(trade.broker_target_order_id).catch(() => null);
    if (targetOrder && !["filled", "canceled", "expired", "rejected"].includes(targetOrder.status)) {
      const replaced = await alpaca.replaceOrder(targetOrder.id, { limit_price: v.target }, trade.asset_class);
      patch.broker_target_order_id = replaced.id;
    }
  }

  const events: TradeRow["events"] = [...(trade.events ?? [])];
  if (v.changed.stop) {
    events.push({ type: "STOP_MOVED", from: p.stop_price, to: v.stop, at: now, note: "manual edit" });
    p.stop_price = v.stop;
    if (p.trail_stop !== null) p.trail_stop = v.stop;
    p.state = p.entry_price !== null && v.stop >= p.entry_price ? "RISK_FREE" : "OPEN";
  }
  if (v.changed.target) {
    events.push({ type: "TARGET_EXTENDED", from: p.target_price, to: v.target, at: now, note: "manual edit" });
    p.target_price = v.target;
  }
  await updateTrade(trade.id, { ...simColumns(p), ...patch, events });
  return { ...trade, sim_state: p, state: p.state, stop_price: p.stop_price, target_price: p.target_price };
}
