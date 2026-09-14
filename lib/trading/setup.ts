import { RISK_ENVELOPE, type StrategyParams } from "./config";
import { adx, atr, ema, lastSwingHigh, lastSwingLow, rsi, sma } from "./indicators";
import type { AssetClass, Bar, IndicatorSnapshot, TradePlan } from "./types";

/**
 * Precomputed indicator series for one symbol. Built once per evaluation run so the
 * backtester and the live scanner share exactly the same maths.
 */
export type SetupSeries = {
  entry: Bar[];
  entryMs: number;
  trend: Bar[];
  trendMs: number;
  ema20: number[];
  ema50: number[];
  rsi: number[];
  atr: number[];
  volSma: number[];
  trendEma200: number[];
  trendAdx: number[];
  /** For each entry index, index of last CLOSED trend bar (or -1). */
  trendIdx: number[];
  /** Super-market regime (SPY/BTC above MA200) per entry index; null when not applicable. */
  marketOk: (boolean | null)[];
};

export function buildSetupSeries(input: {
  entry: Bar[];
  entryMs: number;
  trend: Bar[];
  trendMs: number;
  /** Daily bars of the regime reference (SPY/BTC); omit when the symbol is its own reference. */
  market?: Bar[];
}): SetupSeries {
  const { entry, trend, entryMs, trendMs } = input;
  const closes = entry.map((b) => b.c);
  const trendIdx: number[] = new Array(entry.length).fill(-1);
  let j = -1;
  for (let i = 0; i < entry.length; i++) {
    const closeTime = entry[i].t + entryMs;
    while (j + 1 < trend.length && trend[j + 1].t + trendMs <= closeTime) j++;
    trendIdx[i] = j;
  }

  const marketOk: (boolean | null)[] = new Array(entry.length).fill(null);
  if (input.market && input.market.length) {
    const m = input.market;
    const ma200 = sma(m.map((b) => b.c), 200);
    const dayMs = 86_400_000;
    let k = -1;
    for (let i = 0; i < entry.length; i++) {
      const closeTime = entry[i].t + entryMs;
      while (k + 1 < m.length && m[k + 1].t + dayMs <= closeTime) k++;
      marketOk[i] = k >= 0 && Number.isFinite(ma200[k]) ? m[k].c > ma200[k] : false;
    }
  }

  return {
    entry,
    entryMs,
    trend,
    trendMs,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    rsi: rsi(closes, 14),
    atr: atr(entry, 14),
    volSma: sma(entry.map((b) => b.v), 20),
    trendEma200: ema(trend.map((b) => b.c), 200),
    trendAdx: adx(trend, 14),
    trendIdx,
    marketOk,
  };
}

export type SetupCheck =
  | "WARMUP"
  | "TREND_BELOW_EMA200"
  | "EMA200_SLOPE_NEGATIVE"
  | "ADX_WEAK"
  | "MARKET_REGIME_OFF"
  | "NO_PULLBACK"
  | "RSI_NOT_RESET"
  | "NO_CONFIRMATION"
  | "NO_HIGHER_LOW";

export type SetupResult = {
  triggered: boolean;
  failed: SetupCheck[];
  snapshot: IndicatorSnapshot | null;
};

const RSI_RESET_WINDOW = 5;
const PULLBACK_WINDOW = 3;
const SLOPE_BARS = 5;

export function evaluateSetup(s: SetupSeries, i: number, p: StrategyParams): SetupResult {
  const ti = s.trendIdx[i];
  const bar = s.entry[i];
  if (
    i < 60 ||
    ti < SLOPE_BARS ||
    !Number.isFinite(s.ema50[i]) ||
    !Number.isFinite(s.rsi[i - RSI_RESET_WINDOW]) ||
    !Number.isFinite(s.atr[i]) ||
    !Number.isFinite(s.trendEma200[ti - SLOPE_BARS]) ||
    !Number.isFinite(s.trendAdx[ti])
  ) {
    return { triggered: false, failed: ["WARMUP"], snapshot: null };
  }

  const failed: SetupCheck[] = [];
  const a = s.atr[i];
  const trendClose = s.trend[ti].c;
  const e200 = s.trendEma200[ti];
  const slope = e200 - s.trendEma200[ti - SLOPE_BARS];

  // Stage 2 — market regime (trend timeframe).
  if (!(trendClose > e200)) failed.push("TREND_BELOW_EMA200");
  if (!(slope > 0)) failed.push("EMA200_SLOPE_NEGATIVE");
  if (!(s.trendAdx[ti] > p.adx_min)) failed.push("ADX_WEAK");
  if (s.marketOk[i] === false) failed.push("MARKET_REGIME_OFF");

  // Stage 3.1 — pullback: touch/proximity to EMA20 or EMA50 in the last few bars, not broken far below EMA50.
  let touched = false;
  for (let k = i - PULLBACK_WINDOW + 1; k <= i; k++) {
    const low = s.entry[k].l;
    const near20 = Math.abs(low - s.ema20[k]) <= p.ema_touch_atr * s.atr[k] || (low <= s.ema20[k] && s.entry[k].c >= s.ema20[k]);
    const near50 = Math.abs(low - s.ema50[k]) <= p.ema_touch_atr * s.atr[k] || (low <= s.ema50[k] && s.entry[k].c >= s.ema50[k]);
    if (near20 || near50) touched = true;
  }
  if (!touched || bar.c < s.ema50[i] - p.ema_touch_atr * a) failed.push("NO_PULLBACK");

  // Stage 3.2 — momentum reset: RSI dipped into [low, high], never below the low (no trend break).
  let minRsi = Infinity;
  for (let k = i - RSI_RESET_WINDOW; k <= i; k++) minRsi = Math.min(minRsi, s.rsi[k]);
  if (!(minRsi >= p.rsi_low && minRsi <= p.rsi_high)) failed.push("RSI_NOT_RESET");

  // Stage 3.3 — recovery confirmation.
  const prev = s.entry[i - 1];
  const rsiCross = s.rsi[i - 1] < p.rsi_confirm && s.rsi[i] >= p.rsi_confirm;
  if (!(bar.c > prev.h || rsiCross)) failed.push("NO_CONFIRMATION");

  // Stage 3.4 — structure: a recent swing low below entry that is higher than the prior window's low.
  const swingLow = lastSwingLow(s.entry, i, p.swing_lookback);
  let priorLow = Infinity;
  for (let k = Math.max(0, i - p.swing_lookback * 3); k < i - p.swing_lookback; k++) {
    priorLow = Math.min(priorLow, s.entry[k].l);
  }
  if (swingLow === null || !(swingLow < bar.c) || !(swingLow > priorLow)) failed.push("NO_HIGHER_LOW");

  const swingHigh = lastSwingHigh(s.entry, i, 50);
  const stopDistance = stopDistanceFor(bar.c, a, swingLow, p);

  const snapshot: IndicatorSnapshot = {
    close: bar.c,
    ema20: s.ema20[i],
    ema50: s.ema50[i],
    rsi: s.rsi[i],
    prev_rsi: s.rsi[i - 1],
    atr: a,
    atr_pct: a / bar.c,
    relative_volume: s.volSma[i] > 0 ? bar.v / s.volSma[i] : 1,
    swing_low: swingLow,
    swing_high: swingHigh,
    prev_high: prev.h,
    trend_close: trendClose,
    trend_ema200: e200,
    trend_ema200_slope: slope,
    trend_adx: s.trendAdx[ti],
    market_regime_ok: s.marketOk[i] !== false,
    room_to_resistance_r: swingHigh !== null && stopDistance > 0 ? (swingHigh - bar.c) / stopDistance : null,
  };

  return { triggered: failed.length === 0, failed, snapshot };
}

/** Stage 5 ordering: stop comes from the chart first, size only afterwards. */
export function stopDistanceFor(entry: number, atrValue: number, swingLow: number | null, p: StrategyParams): number {
  const atrStop = p.atr_stop_mult * atrValue;
  const structural = swingLow !== null ? entry - swingLow + p.swing_buffer_atr * atrValue : 0;
  return Math.max(atrStop, structural);
}

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
