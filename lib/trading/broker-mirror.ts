import { alpaca, sellableQty } from "./broker/alpaca";
import { flattenAtBroker } from "./broker/flatten";
import { revertFailedBrokerClose } from "./broker/revert-close";
import { bracketLegs, brokerExit, brokerSupportsExitPlan, pendingDecision, protectiveAdjustments } from "./broker/sync";
import { applyExternalExit, applyExternalFill, type SimPosition } from "./position";
import { logEvent, type TradeRow } from "./store";
import { DAILY_TREND_STRATEGY_VERSION, INTRADAY_STRATEGY_VERSION, MANUAL_STRATEGY_VERSION } from "./strategy-versions";

/**
 * Keeping the (paper) broker and the simulator in agreement.
 *
 * The strategy is the brain and the broker is the source of truth for fills:
 * entries are adopted from the broker, never invented, and the broker holds a
 * protective stop so an outage never leaves a position unprotected.
 *
 * Split out of engine.ts — this is the part that moves real orders, and it was
 * buried in the middle of a 1300-line tick.
 */

/** An intraday limit entry that has not filled within 15 minutes is stale — cancel it. */
const INTRADAY_ENTRY_EXPIRY_MS = 15 * 60_000;
/** A manual limit (pullback) entry waits up to an hour. */
const MANUAL_ENTRY_EXPIRY_MS = 60 * 60_000;

export async function resolveBrokerEntry(trade: TradeRow, p: SimPosition, events: TradeRow["events"], now: number): Promise<{ done: boolean; patch: Record<string, unknown> }> {
  if (!trade.broker_entry_order_id) {
    p.state = "CANCELLED";
    p.cancel_reason = "BROKER_ORDER_MISSING";
    p.closed_at = now;
    return { done: true, patch: {} };
  }
  const order = await alpaca.getOrder(trade.broker_entry_order_id);
  const expiry = trade.strategy_version === INTRADAY_STRATEGY_VERSION ? INTRADAY_ENTRY_EXPIRY_MS : trade.strategy_version === MANUAL_STRATEGY_VERSION ? MANUAL_ENTRY_EXPIRY_MS : undefined;
  const d = pendingDecision(order, Date.parse(trade.trigger_timestamp), now, expiry);
  const patch: Record<string, unknown> = { broker_status: order.status, broker_filled_qty: Number(order.filled_qty) };
  const cancel = (reason: string) => {
    p.state = "CANCELLED";
    p.cancel_reason = reason;
    p.closed_at = now;
    events.push({ type: "CANCELLED", reason, at: now });
  };
  switch (d.kind) {
    case "WAIT":
      return { done: false, patch };
    case "EXPIRE":
      await alpaca.cancelOrder(order.id);
      cancel("NOT_FILLED");
      return { done: true, patch };
    case "DEAD":
      cancel(d.reason);
      return { done: true, patch };
    case "PARTIAL_UNWIND":
      // Below the 70% fill floor the position is too small to be the planned trade — exit it.
      await alpaca.cancelOrder(order.id);
      await alpaca.closePosition(trade.symbol, trade.asset_class).catch(() => null);
      cancel(`PARTIAL_FILL_${Math.round(d.ratio * 100)}PCT_UNWOUND`);
      return { done: true, patch };
    case "PARTIAL_KEEP":
    case "FILLED": {
      if (d.kind === "PARTIAL_KEEP") await alpaca.cancelOrder(order.id);
      events.push(...applyExternalFill(p, d.price, d.qty, d.at));
      const isDailyTrend = trade.strategy_version === DAILY_TREND_STRATEGY_VERSION;
      if (trade.asset_class === "STOCK" && !isDailyTrend) {
        // v2 / intraday / manual stocks entered on a bracket — its legs already carry the stop/target.
        const legs = bracketLegs(order);
        patch.broker_stop_order_id = legs.stop?.id ?? null;
        patch.broker_target_order_id = legs.target?.id ?? null;
      } else {
        // Size the protective stop from what the broker actually holds, not from
        // the fill: crypto fees are taken in the asset, so the balance is a
        // fraction below filled_qty and a sell for the full fill is rejected
        // with `insufficient balance`. That rejection threw out of the tick, so
        // the stop was never placed and the position ran unprotected while the
        // error repeated every 5 minutes.
        const qty = await sellableQty(trade.symbol, trade.asset_class, d.qty);
        if (qty === null) {
          events.push({ type: "CANCELLED", reason: "BROKER_NO_POSITION_FOR_STOP", at: now });
          patch.broker_status = "stop_skipped_no_position";
        } else {
          const stop =
            trade.asset_class === "STOCK"
              ? await alpaca.placeStockStop({ symbol: trade.symbol, qty, stop: p.stop_price, clientId: `${trade.id.slice(0, 18)}-sl-${now}` })
              : await alpaca.placeCryptoStop({ symbol: trade.symbol, qty, stop: p.stop_price, clientId: `${trade.id.slice(0, 18)}-sl-${now}` });
          patch.broker_stop_order_id = stop.id;
        }
      }
      return { done: false, patch };
    }
  }
}

/** Make the broker match the strategy: adopt broker exits, close on strategy exits, move protective orders. */
export async function mirrorToBroker(trade: TradeRow, p: SimPosition, events: TradeRow["events"], lastPrice: number | null, now: number): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  // A partial the broker was never told about means it still holds the full
  // size behind a full-size stop, while the journal reports a reduced position.
  // Nothing should be able to reach this (see brokerSupportsExitPlan) — if it
  // does, say so loudly instead of trading a position we cannot keep in sync.
  if (p.partial_exit_price !== null && p.state !== "CLOSED" && !brokerSupportsExitPlan(p)) {
    await logEvent({
      kind: "BROKER_DESYNC",
      symbol: trade.symbol,
      severity: "critical",
      message: `${trade.symbol}: יציאה חלקית לא שוקפה לברוקר — הפוזיציה אצל הברוקר גדולה מהיומן`,
      data: { trade_id: trade.id },
      push: true,
    });
  }
  const stopId = (trade.broker_stop_order_id as string | null) ?? null;
  const targetId = (trade.broker_target_order_id as string | null) ?? null;
  const [stopFetched, targetOrder] = await Promise.all([stopId ? alpaca.getOrder(stopId) : null, targetId ? alpaca.getOrder(targetId) : null]);
  let stopOrder = stopFetched;
  const exit = brokerExit({ stop: stopOrder, target: targetOrder, positionQty: null });
  const at = now;

  if (exit && Number.isFinite(exit.price)) {
    if (p.state === "CLOSED") repriceExit(p, exit.price);
    else events.push(...applyExternalExit(p, exit.price, exit.reason, at));
    patch.broker_status = `exit_${exit.reason.toLowerCase()}`;
    return patch;
  }

  if (p.state === "CLOSED") {
    // Strategy exit the broker hasn't executed — flatten, and only keep the
    // journal closed if the broker is actually flat.
    try {
      const px = await flattenAtBroker(trade);
      if (px !== null) repriceExit(p, px);
      patch.broker_status = `closed_${(p.exit_reason ?? "manual").toLowerCase()}`;
    } catch (err) {
      revertFailedBrokerClose(p);
      const detail = err instanceof Error ? err.message.slice(0, 80) : "?";
      events.push({ type: "CANCELLED", reason: `BROKER_CLOSE_FAILED:${detail}`, at });
      patch.broker_status = "close_failed";
      patch.realized_r = null;
      patch.realized_pnl = null;
      await logEvent({
        kind: "BROKER_DESYNC",
        symbol: trade.symbol,
        severity: "critical",
        message: `${trade.symbol}: סגירה בברוקר נכשלה — העסקה נשארת פתוחה ביומן`,
        data: { trade_id: trade.id, detail },
        push: true,
      });
    }
    return patch;
  }

  if ((p.state === "OPEN" || p.state === "RISK_FREE") && (!stopOrder || ["canceled", "expired", "rejected", "filled"].includes(stopOrder.status))) {
    const qty = await sellableQty(trade.symbol, trade.asset_class, p.size);
    if (qty) {
      const stop =
        trade.asset_class === "STOCK"
          ? await alpaca.placeStockStop({ symbol: trade.symbol, qty, stop: p.stop_price, clientId: `${trade.id.slice(0, 18)}-sl-${now}` })
          : await alpaca.placeCryptoStop({ symbol: trade.symbol, qty, stop: p.stop_price, clientId: `${trade.id.slice(0, 18)}-sl-${now}` });
      patch.broker_stop_order_id = stop.id;
      stopOrder = stop;
    }
  }

  const adj = protectiveAdjustments({ assetClass: trade.asset_class, simStop: p.stop_price, simTarget: p.target_price, stop: stopOrder, target: targetOrder });
  if (adj.stopTo !== undefined && stopOrder) {
    const replaced = await alpaca.replaceOrder(stopOrder.id, trade.asset_class === "STOCK" ? { stop_price: adj.stopTo } : { stop_price: adj.stopTo, limit_price: adj.stopTo * 0.99 }, trade.asset_class);
    patch.broker_stop_order_id = replaced.id;
  }
  if (adj.targetTo !== undefined && targetOrder) {
    const replaced = await alpaca.replaceOrder(targetOrder.id, { limit_price: adj.targetTo }, trade.asset_class);
    patch.broker_target_order_id = replaced.id;
  }
  if (lastPrice === null) patch.broker_status = "open";
  return patch;
}

/**
 * Replace a simulated exit price with the broker's actual fill.
 *
 * Only the closing fill is repriced, so the adjustment must use the size that
 * fill actually sold. `exit_size` is recorded by `close()`; the fallback
 * reconstruction is for rows persisted before that field existed and is only
 * correct for the structural plans every live strategy uses (v1's `use_partial`
 * sells half, which `partial_fraction` does not describe).
 */
function repriceExit(p: SimPosition, price: number) {
  if (p.exit_price === null) return;
  const qty =
    p.exit_size ??
    p.initial_size - (p.partial_exit_price !== null ? p.initial_size * (p.partial_fraction ?? (p.use_partial ? 0.5 : 0)) : 0);
  if (!(qty > 0)) return;
  p.cash_flow += (price - p.exit_price) * qty;
  p.exit_price = price;
}
