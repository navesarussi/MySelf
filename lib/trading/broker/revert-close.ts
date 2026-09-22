import { EXECUTION_RULES } from "../config";
import type { SimPosition } from "../position";

function closeFee(p: SimPosition, price: number, size: number) {
  return EXECUTION_RULES.FEE_RATE[p.asset_class] * price * size;
}

/**
 * Undo a simulated close that the broker did not actually fill.
 * The journal must not read flat against a position Alpaca still holds.
 */
export function revertFailedBrokerClose(p: SimPosition): boolean {
  if (p.state !== "CLOSED" || p.exit_price === null) return false;
  const qty = p.exit_size ?? (p.size === 0 ? p.initial_size : 0);
  if (!(qty > 0)) return false;
  const price = p.exit_price;
  const f = closeFee(p, price, qty);
  p.cash_flow -= price * qty - f;
  p.fees_paid = Math.max(0, p.fees_paid - f);
  p.size += qty;
  p.state = p.entry_price !== null && p.stop_price >= p.entry_price ? "RISK_FREE" : "OPEN";
  p.exit_price = null;
  p.exit_reason = null;
  p.exit_size = undefined;
  p.closed_at = null;
  return true;
}
