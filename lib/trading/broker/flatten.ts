import type { AssetClass } from "../types";
import { alpaca, isAlpacaInsufficientQty, isDustPosition, sellableQty } from "./alpaca";

/** Waits between broker calls; tests replace it to run the retry loop instantly. */
export const flattenTiming = { sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };
const sleep = (ms: number) => flattenTiming.sleep(ms);

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

/** The close order once Alpaca has had a moment to work it (fill price + final status). */
async function settledOrder(orderId: string) {
  await sleep(800);
  return alpaca.getOrder(orderId).catch(() => null);
}

/**
 * Alpaca reports the position a moment after the fill. Checking once, 800ms in, read a fully sold DOT
 * position as still held and raised a false "close failed" (2026-09-26) — poll briefly before deciding.
 */
async function waitFlat(t: { symbol: string; asset_class: AssetClass }, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const held = await alpaca.position(t.symbol, t.asset_class).catch(() => undefined);
    if (held !== undefined && isDustPosition(held)) return true;
    if (i < tries - 1) await sleep(500);
  }
  return false;
}

const isNotFound = (err: unknown) => err instanceof Error && /alpaca_404/.test(err.message);

const FLATTEN_ATTEMPTS = 8;

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
  let px: number | null = Number(held.current_price) || null;
  let lastErr: unknown = null;
  // The paper crypto engine fills a large market close in pieces (fill part, cancel the rest): DOT's 24.7K
  // units took four orders in 12 seconds. Every attempt sells what is left.
  for (let attempt = 0; attempt < FLATTEN_ATTEMPTS; attempt++) {
    try {
      const placed = await alpaca.closePosition(t.symbol, t.asset_class);
      const order = await settledOrder(placed.id);
      const fill = Number(order?.filled_avg_price);
      if (fill > 0) px = fill;
      if (await waitFlat(t, order?.status === "filled" ? 6 : 1)) return px;
      lastErr = new Error("alpaca_close_still_held");
    } catch (err) {
      lastErr = err;
      // 404: no position left to close — an earlier piece already sold it.
      if (isNotFound(err) && (await waitFlat(t, 3))) return px;
      if (!isNotFound(err) && !isAlpacaInsufficientQty(err)) throw err;
    }
    await releaseReservedQty(t);
    await sleep(300);
  }
  held = await alpaca.position(t.symbol, t.asset_class);
  const qty = held && !isDustPosition(held) ? await sellableQty(t.symbol, t.asset_class, Number(held.qty)) : null;
  if (qty) {
    const placed = await alpaca.placeMarketSell({
      symbol: t.symbol,
      assetClass: t.asset_class,
      qty,
      clientId: `fl-${t.symbol}-${Date.now()}`.slice(0, 48),
    });
    const order = await settledOrder(placed.id);
    const fill = Number(order?.filled_avg_price);
    if (fill > 0) px = fill;
  }
  if (await waitFlat(t, 6)) return px;
  throw lastErr instanceof Error ? lastErr : new Error("alpaca_flatten_failed");
}
