import type { SimPosition } from "./position";

/**
 * A trade has earned the right to ride: it reached the trail threshold.
 * Chop (never made trail_after_r) still gets the time stop; a working trend does not.
 */
export function isTrendRide(p: Pick<SimPosition, "entry_price" | "stop_distance" | "mfe_r" | "peak_price" | "trail_after_r">): boolean {
  const after = p.trail_after_r;
  if (after === null || after === undefined || p.entry_price === null || !(p.stop_distance > 0)) return false;
  const peak = p.peak_price ?? p.entry_price;
  const peakR = (peak - p.entry_price) / p.stop_distance;
  return p.mfe_r >= after || peakR >= after;
}

/** TIME_STOP only flattens chop. A trade that already ran to trail_after_r keeps riding. */
export function timeStopReason(p: SimPosition, timeUp: boolean): "TIME_STOP" | undefined {
  if (!timeUp || p.state === "PENDING") return undefined;
  if (isTrendRide(p)) return undefined;
  return "TIME_STOP";
}
