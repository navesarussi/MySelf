import { UNIVERSE_RULES } from "./config";
import { atr } from "./indicators";
import type { AssetClass, Bar, LiquidityTier, VolatilityTier } from "./types";

/** Stage 1 — daily universe screen + bucket classification (learning is per bucket, not per asset). */

export type ScreenMetrics = {
  price: number;
  avg_dollar_volume_30d: number;
  atr_pct: number;
  median_atr_pct_90d: number;
  history_days: number;
  spread_pct: number | null;
};

export type ScreenFailure = "LIQUIDITY" | "SPREAD" | "VOLATILITY" | "HISTORY" | "PRICE";

/**
 * Metrics as of daily index `idx` (inclusive). `quoteVolume` = true when bar.v is already
 * in quote currency (not used for Binance/Yahoo which report base volume).
 */
export function screenMetricsAt(daily: Bar[], idx = daily.length - 1, spreadPct: number | null = null): ScreenMetrics | null {
  if (idx < 20) return null;
  const a = atr(daily.slice(Math.max(0, idx - 120), idx + 1), 14);
  const tail = a.filter(Number.isFinite);
  const bar = daily[idx];
  let dv = 0;
  let n = 0;
  for (let i = Math.max(0, idx - 29); i <= idx; i++) {
    dv += daily[i].c * daily[i].v;
    n += 1;
  }
  const atrPcts: number[] = [];
  const window = daily.slice(Math.max(0, idx - 120), idx + 1);
  const off = window.length - tail.length;
  for (let k = Math.max(0, tail.length - 90); k < tail.length; k++) atrPcts.push(tail[k] / window[k + off].c);
  const sorted = [...atrPcts].sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  return {
    price: bar.c,
    avg_dollar_volume_30d: n ? dv / n : 0,
    atr_pct: tail.length ? tail[tail.length - 1] / bar.c : 0,
    median_atr_pct_90d: median,
    history_days: Math.round((bar.t - daily[0].t) / 86_400_000),
    spread_pct: spreadPct,
  };
}

export function screenFailures(m: ScreenMetrics, assetClass: AssetClass, typicalStopPct: number): ScreenFailure[] {
  const f: ScreenFailure[] = [];
  if (m.avg_dollar_volume_30d < UNIVERSE_RULES.MIN_AVG_DOLLAR_VOLUME_30D) f.push("LIQUIDITY");
  if (m.spread_pct !== null && typicalStopPct > 0 && m.spread_pct > UNIVERSE_RULES.MAX_SPREAD_OF_STOP * typicalStopPct) f.push("SPREAD");
  if (m.atr_pct < UNIVERSE_RULES.MIN_ATR_PCT) f.push("VOLATILITY");
  if (m.history_days < UNIVERSE_RULES.MIN_HISTORY_DAYS) f.push("HISTORY");
  if (assetClass === "STOCK" && m.price <= UNIVERSE_RULES.MIN_STOCK_PRICE) f.push("PRICE");
  return f;
}

export function volatilityTier(medianAtrPct: number): VolatilityTier {
  if (medianAtrPct < UNIVERSE_RULES.VOL_TIER_LOW_MAX) return "LOW";
  if (medianAtrPct < UNIVERSE_RULES.VOL_TIER_MID_MAX) return "MID";
  return "HIGH";
}

export function liquidityTier(avgDollarVolume: number): LiquidityTier {
  return avgDollarVolume >= UNIVERSE_RULES.TIER_1_DOLLAR_VOLUME ? "TIER_1" : "TIER_2";
}

export function bucketId(assetClass: AssetClass, m: Pick<ScreenMetrics, "median_atr_pct_90d" | "avg_dollar_volume_30d">): string {
  return `${assetClass}:${volatilityTier(m.median_atr_pct_90d)}:${liquidityTier(m.avg_dollar_volume_30d)}`;
}
