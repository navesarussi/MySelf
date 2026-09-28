/** Client/server helpers for live position price display (pure, no RN). */

import { round } from "./round";

export type PositionPriceInputs = {
  entry_price: number | null;
  stop_price: number;
  target_price: number;
  last_price: number | null;
  /** 1R in price, fixed at the fill. Once the stop trails to or past the entry, stop_price no longer measures it. */
  stop_distance?: number | null;
};

export type PositionPriceView = {
  lastPrice: number | null;
  currentR: number | null;
  distanceToStopPct: number | null;
  progress: number | null;
  /** Where the entry sits on the stop→scale-top bar (0–1). */
  entryPos: number | null;
  /** The take-profit price, or null when the trade exits on a strategy signal / trail (no real target). */
  target: number | null;
};

/**
 * Trades that exit on a strategy signal or a trail carry a placeholder target far away (NO_TARGET_R) so the
 * position machine never takes profit. Anything beyond this many R is that placeholder, not a target.
 */
export const REAL_TARGET_MAX_R = 50;

export function realTarget(p: Pick<PositionPriceInputs, "entry_price" | "stop_price" | "target_price" | "stop_distance"> & { entry_limit?: number | null }): number | null {
  const entry = p.entry_price ?? p.entry_limit ?? null;
  if (entry === null) return p.target_price;
  const oneR = p.stop_distance && p.stop_distance > 0 ? p.stop_distance : entry - p.stop_price;
  if (!(oneR > 0)) return p.target_price;
  return (p.target_price - entry) / oneR > REAL_TARGET_MAX_R ? null : p.target_price;
}

/** Merge a live tick with the dashboard snapshot and derive R / slider progress. */
export function positionPriceView(p: PositionPriceInputs, livePrice: number | null | undefined): PositionPriceView {
  const lastPrice = livePrice ?? p.last_price ?? null;
  const entry = p.entry_price;
  // R is measured against the risk taken at the fill: measured against the current stop, a trade whose stop
  // had moved to breakeven (the winners) showed no R at all.
  const stopDistance = p.stop_distance && p.stop_distance > 0 ? p.stop_distance : entry !== null ? entry - p.stop_price : null;
  const target = realTarget(p);
  // No real target: scale the bar from the stop to +3R (or the price, if already beyond it).
  const top = target ?? Math.max(entry !== null && stopDistance ? entry + 3 * stopDistance : p.stop_price, lastPrice ?? -Infinity);
  const span = top - p.stop_price;

  const currentR =
    entry !== null && lastPrice !== null && stopDistance !== null && stopDistance > 0
      ? round((lastPrice - entry) / stopDistance, 2)
      : null;

  const distanceToStopPct = lastPrice !== null ? round((lastPrice - p.stop_price) / lastPrice, 4) : null;

  const progress =
    lastPrice !== null && span > 0 ? Math.min(1, Math.max(0, (lastPrice - p.stop_price) / span)) : null;

  const entryPos = entry !== null && span > 0 ? Math.min(1, Math.max(0, (entry - p.stop_price) / span)) : null;
  return { lastPrice, currentR, distanceToStopPct, progress, entryPos, target };
}
