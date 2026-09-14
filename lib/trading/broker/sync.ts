import type { AssetClass, ExitReason } from "../types";
import type { AlpacaOrder } from "./alpaca";

/**
 * Pure decisions for mirroring a simulated position onto a real (paper) broker account.
 * The strategy/state machine stays the brain; the broker is the source of truth for fills,
 * and holds a protective stop so a system outage never leaves a position unprotected.
 */

export const ENTRY_EXPIRY_MS = 4 * 3_600_000;
export const MIN_PARTIAL_FILL = 0.7;

const num = (x: string | null | undefined) => (x === null || x === undefined ? NaN : Number(x));

export type PendingDecision =
  | { kind: "WAIT" }
  | { kind: "FILLED"; price: number; qty: number; at: number }
  | { kind: "PARTIAL_KEEP"; price: number; qty: number; at: number }
  | { kind: "PARTIAL_UNWIND"; price: number; qty: number; ratio: number }
  | { kind: "EXPIRE" }
  | { kind: "DEAD"; reason: string };

export function pendingDecision(order: AlpacaOrder, triggerAt: number, now: number, expiryMs = ENTRY_EXPIRY_MS): PendingDecision {
  const filledQty = num(order.filled_qty);
  const qty = num(order.qty);
  const price = num(order.filled_avg_price);
  const at = order.filled_at ? Date.parse(order.filled_at) : now;
  if (order.status === "filled") return { kind: "FILLED", price, qty: filledQty, at };
  if (["canceled", "expired", "rejected", "done_for_day"].includes(order.status)) {
    // A cancelled order can still carry a partial fill.
    if (filledQty > 0) return filledQty / qty >= MIN_PARTIAL_FILL ? { kind: "PARTIAL_KEEP", price, qty: filledQty, at } : { kind: "PARTIAL_UNWIND", price, qty: filledQty, ratio: filledQty / qty };
    return { kind: "DEAD", reason: `BROKER_${order.status.toUpperCase()}` };
  }
  if (now - triggerAt < expiryMs) return { kind: "WAIT" };
  if (filledQty > 0) return filledQty / qty >= MIN_PARTIAL_FILL ? { kind: "PARTIAL_KEEP", price, qty: filledQty, at } : { kind: "PARTIAL_UNWIND", price, qty: filledQty, ratio: filledQty / qty };
  return { kind: "EXPIRE" };
}

/** Stock brackets carry their protective legs inside the entry order. */
export function bracketLegs(order: AlpacaOrder | null): { stop: AlpacaOrder | null; target: AlpacaOrder | null } {
  const legs = order?.legs ?? [];
  return {
    stop: legs.find((l) => l.type === "stop" || l.type === "stop_limit") ?? null,
    target: legs.find((l) => l.type === "limit") ?? null,
  };
}

/** Did the broker already exit the position on its own (stop or take-profit filled)? */
export function brokerExit(view: { stop: AlpacaOrder | null; target: AlpacaOrder | null; positionQty: number | null }): { price: number; reason: ExitReason } | null {
  if (view.stop?.status === "filled") return { price: num(view.stop.filled_avg_price), reason: "STOP" };
  if (view.target?.status === "filled") return { price: num(view.target.filled_avg_price), reason: "TARGET" };
  return null;
}

/** Protective orders must track the strategy: stop only ratchets up; stock take-profit follows the (possibly extended) target. */
export function protectiveAdjustments(input: { assetClass: AssetClass; simStop: number; simTarget: number; stop: AlpacaOrder | null; target: AlpacaOrder | null }) {
  const out: { stopTo?: number; targetTo?: number } = {};
  const brokerStop = num(input.stop?.stop_price);
  const tol = (x: number) => Math.abs(x) * 0.0005;
  if (input.stop && Number.isFinite(brokerStop) && input.simStop > brokerStop + tol(brokerStop)) out.stopTo = input.simStop;
  if (input.assetClass === "STOCK" && input.target) {
    const brokerTarget = num(input.target.limit_price);
    if (Number.isFinite(brokerTarget) && Math.abs(input.simTarget - brokerTarget) > tol(brokerTarget)) out.targetTo = input.simTarget;
  }
  return out;
}
