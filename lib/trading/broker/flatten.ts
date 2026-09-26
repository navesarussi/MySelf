import type { AssetClass } from "../types";
import { alpaca, isAlpacaInsufficientQty, isDustPosition, sellableQty } from "./alpaca";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cancelAndSettle(id: string) {
  await alpaca.cancelOrder(id);
  for (let i = 0; i < 8; i++) {
    const o = await alpaca.getOrder(id).catch(() => null);
    if (!o || ["canceled", "expired", "filled", "rejected", "done_for_day"].includes(o.status)) return;
    await sleep(200);
  }
}

async function releaseReservedQty(t: {
  symbol: string;
  asset_class: AssetClass;
  broker_entry_order_id: string | null;
  broker_stop_order_id: string | null;
  broker_target_order_id: string | null;
}) {
  const tracked = [t.broker_entry_order_id, t.broker_stop_order_id, t.broker_target_order_id].filter((id): id is string => Boolean(id));
  const open = await alpaca.openOrders(t.symbol, t.asset_class).catch(() => [] as { id: string }[]);
  const ids = [...new Set([...tracked, ...open.map((o) => o.id)])];
  for (const id of ids) await cancelAndSettle(id);
}

async function fillPrice(orderId: string, fallback: number | null): Promise<number | null> {
  await sleep(800);
  const filled = await alpaca.getOrder(orderId).catch(() => null);
  const px = Number(filled?.filled_avg_price);
  return Number.isFinite(px) && px > 0 ? px : fallback;
}

/**
 * Flatten at the broker. Protective sell orders reserve qty, so a close that
 * races them returns 403 insufficient balance — we cancel live orders, wait,
 * retry, then market-sell whatever is actually sellable.
 *
 * Throws if the broker still holds size after those attempts. Callers must not
 * mark the journal CLOSED in that case.
 */
export async function flattenAtBroker(t: {
  symbol: string;
  asset_class: AssetClass;
  broker_entry_order_id: string | null;
  broker_stop_order_id: string | null;
  broker_target_order_id: string | null;
}): Promise<number | null> {
  await releaseReservedQty(t);
  let held = await alpaca.position(t.symbol, t.asset_class);
  if (!held || isDustPosition(held)) return null;
  const fallback = Number(held.current_price) || null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await alpaca.closePosition(t.symbol, t.asset_class);
      const px = await fillPrice(order.id, fallback);
      held = await alpaca.position(t.symbol, t.asset_class);
      if (isDustPosition(held)) return px;
      lastErr = new Error("alpaca_close_still_held");
    } catch (err) {
      lastErr = err;
      if (!isAlpacaInsufficientQty(err)) throw err;
    }
    await releaseReservedQty(t);
    await sleep(300);
  }
  const qty = await sellableQty(t.symbol, t.asset_class, Number(held?.qty));
  if (qty) {
    const order = await alpaca.placeMarketSell({
      symbol: t.symbol,
      assetClass: t.asset_class,
      qty,
      clientId: `fl-${t.symbol}-${Date.now()}`.slice(0, 48),
    });
    const px = await fillPrice(order.id, fallback);
    held = await alpaca.position(t.symbol, t.asset_class);
    if (isDustPosition(held)) return px;
  }
  throw lastErr instanceof Error ? lastErr : new Error("alpaca_flatten_failed");
}
