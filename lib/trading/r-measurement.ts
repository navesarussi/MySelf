import { R_MEASUREMENT } from "./config";

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

/** Risk USD implied by stored realized_r and P&L (settlement denominator). */
export function storedRiskUsd(realized_pnl: number, realized_r: number | null | undefined): number {
  if (realized_r == null || Math.abs(realized_r) < 1e-9) return 0;
  return Math.abs(realized_pnl / realized_r);
}

/** R-multiple from closed-trade fields, with the risk floor applied. Client-safe (no store). */
export function rFromPnl(input: {
  entry_price: number | null;
  initial_stop_price: number;
  position_size: number;
  realized_pnl: number | null;
  realized_r?: number | null;
}): number | null {
  const { entry_price: entry, initial_stop_price: stop, position_size: size, realized_pnl: pnl, realized_r } = input;
  if (entry === null || !(stop > 0) || !(size > 0) || pnl === null) return realized_r ?? null;
  const floored = flooredRiskUsd({ entry_price: entry, stop_price: stop, size });
  const stored = storedRiskUsd(pnl, realized_r);
  // Floor can only shrink |R|: never use a denominator smaller than settlement used.
  const risk = Math.max(stored, floored);
  if (!(risk > 0)) return realized_r ?? null;
  const r = pnl / risk;
  if (realized_r != null && Math.abs(r) > Math.abs(realized_r) + 1e-9) return Math.round(realized_r * 1000) / 1000;
  return Math.round(r * 1000) / 1000;
}
