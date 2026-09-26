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
};

/** Merge a live tick with the dashboard snapshot and derive R / slider progress. */
export function positionPriceView(p: PositionPriceInputs, livePrice: number | null | undefined): PositionPriceView {
  const lastPrice = livePrice ?? p.last_price ?? null;
  const entry = p.entry_price;
  // R is measured against the risk taken at the fill: measured against the current stop, a trade whose stop
  // had moved to breakeven (the winners) showed no R at all.
  const stopDistance = p.stop_distance && p.stop_distance > 0 ? p.stop_distance : entry !== null ? entry - p.stop_price : null;
  const span = p.target_price - p.stop_price;

  const currentR =
    entry !== null && lastPrice !== null && stopDistance !== null && stopDistance > 0
      ? round((lastPrice - entry) / stopDistance, 2)
      : null;

  const distanceToStopPct = lastPrice !== null ? round((lastPrice - p.stop_price) / lastPrice, 4) : null;

  const progress =
    lastPrice !== null && span > 0 ? Math.min(1, Math.max(0, (lastPrice - p.stop_price) / span)) : null;

  return { lastPrice, currentR, distanceToStopPct, progress };
}
