import { RISK_ENVELOPE } from "./config";
import type { AssetClass, TradePlan } from "./types";

/** Stage 5 — the stop comes from the chart first; only then is size derived from risk. */
export function buildTradePlan(input: {
  entry: number;
  stopDistance: number;
  equity: number;
  assetClass: AssetClass;
  /** Global live risk scale (≤ 1) × agent multiplier (≤ 1). */
  riskScale: number;
}): TradePlan | null {
  const { entry, stopDistance, equity, assetClass } = input;
  if (!(entry > 0) || !(stopDistance > 0) || !(stopDistance < entry) || !(equity > 0)) return null;
  // Clamp defensively — nothing may push risk above the envelope.
  const scale = Math.min(1, Math.max(0, input.riskScale));
  const riskAmount = RISK_ENVELOPE.MAX_RISK_PER_TRADE[assetClass] * equity * scale;
  if (riskAmount <= 0) return null;
  let size = riskAmount / stopDistance;
  const maxNotional = RISK_ENVELOPE.MAX_ASSET_EXPOSURE * equity;
  let reduced = false;
  // Over exposure → shrink the position, never tighten the stop.
  if (size * entry > maxNotional) {
    size = maxNotional / entry;
    reduced = true;
  }
  if (assetClass === "STOCK") size = Math.floor(size);
  else size = Math.floor(size * 1e6) / 1e6;
  if (size <= 0) return null;
  return {
    entry,
    stop: entry - stopDistance,
    target: entry + RISK_ENVELOPE.MIN_RR_RATIO * stopDistance,
    stop_distance: stopDistance,
    size,
    // Actual money at risk after rounding/exposure cap.
    risk_amount: size * stopDistance,
    notional: size * entry,
    size_reduced_for_exposure: reduced,
  };
}
