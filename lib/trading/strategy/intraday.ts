import type { Bar } from "../types";
import { buildTfSeries, closedIdx, percentileRank, type TfSeries } from "./series";

/**
 * Intraday strategy (testing phase) — deterministic half on crypto 15m setups with 5m entry timing.
 * Wyckoff mechanics translated into rules, plus a plain squeeze breakout as a control group:
 *  - WYCKOFF_SPRING: sideways trading range → shakeout below support that closes back inside (supply absorbed).
 *  - WYCKOFF_SOS:    sign of strength — wide-spread, high-volume close above range resistance (effort = result).
 *  - WYCKOFF_LPS:    last point of support — low-volume pullback to the broken resistance after an SOS.
 *  - BREAKOUT_15M:   close above the 20-bar high after a Bollinger squeeze with volume (non-Wyckoff baseline).
 * A setup on a CLOSED 15m bar is armed for `confirm_window_5m` bars; entry needs a bullish 5m close that holds
 * the setup bar's close. Pure and look-ahead free: live scanning and the backtest call the same functions.
 */

export type IntradaySetup = "WYCKOFF_SPRING" | "WYCKOFF_SOS" | "WYCKOFF_LPS" | "BREAKOUT_15M";

export type IntradayParams = {
  version: string;
  setups: IntradaySetup[];
  /** Longs only with the 15m trend: close > EMA200 and EMA50 > EMA200 (research: counter-trend lost gross). */
  trend_filter: boolean;
  range_bars: number;
  range_min_atr: number;
  range_max_atr: number;
  range_max_drift: number;
  spring_max_pen_atr: number;
  sos_vol_mult: number;
  sos_spread_atr: number;
  lps_window: number;
  breakout_lookback: number;
  squeeze_pct: number;
  breakout_vol_mult: number;
  confirm_window_5m: number;
  stop_buffer_atr: number;
  min_stop_atr: number;
  max_stop_atr: number;
  /** Fees are ~0.2% round trip — a stop tighter than this turns every trade into a fee donation. */
  min_stop_pct: number;
  /** Stocks cost ~0.1% round trip (commission-free) — a tighter minimum stop is affordable. */
  min_stop_pct_stock: number;
  min_rr: number;
  breakeven_at_r: number;
  trail_after_r: number;
  trail_mult_atr15: number;
  time_stop_bars_5m: number;
  entry_cushion: number;
};

export const INTRADAY_PARAMS: IntradayParams = {
  version: "intraday-wyckoff-1",
  setups: ["WYCKOFF_SPRING", "WYCKOFF_SOS", "WYCKOFF_LPS", "BREAKOUT_15M"],
  trend_filter: true,
  range_bars: 48,
  range_min_atr: 2.5,
  range_max_atr: 12,
  range_max_drift: 0.5,
  spring_max_pen_atr: 1.5,
  sos_vol_mult: 1.8,
  sos_spread_atr: 1.1,
  lps_window: 16,
  breakout_lookback: 20,
  squeeze_pct: 0.4,
  breakout_vol_mult: 1.5,
  confirm_window_5m: 6,
  stop_buffer_atr: 0.15,
  min_stop_atr: 0.6,
  max_stop_atr: 3,
  min_stop_pct: 0.012,
  min_stop_pct_stock: 0.005,
  min_rr: 2,
  breakeven_at_r: 1,
  trail_after_r: 1.5,
  trail_mult_atr15: 2,
  time_stop_bars_5m: 144,
  entry_cushion: 0.001,
};

/** Per-asset-class params (stocks get their own minimum stop distance). */
export function intradayParamsFor(assetClass: "STOCK" | "CRYPTO_MAJOR" | "CRYPTO_ALT", p: IntradayParams = INTRADAY_PARAMS): IntradayParams {
  return assetClass === "STOCK" ? { ...p, min_stop_pct: p.min_stop_pct_stock } : p;
}

export const M5 = 5 * 60_000;
export const M15 = 15 * 60_000;

export type IntradayFrames = { s15: TfSeries; s5: TfSeries };

export function buildIntradayFrames(bars15: Bar[], bars5: Bar[]): IntradayFrames {
  return { s15: buildTfSeries(bars15, M15), s5: buildTfSeries(bars5, M5) };
}

export type IntradayFeatures = {
  volume_ratio: number | null;
  spread_atr: number | null;
  close_position: number | null;
  /** Wyckoff effort vs result: volume ratio per ATR of spread (high = effort without result). */
  effort_vs_result: number | null;
  range_width_atr: number | null;
  range_support_tests: number | null;
  range_resistance_tests: number | null;
  rsi15: number | null;
  above_ema200_15m: boolean | null;
  ema50_above_ema200_15m: boolean | null;
  atr15_pct: number | null;
};

export type IntradaySetupHit = {
  setup: IntradaySetup;
  i: number;
  /** Structural invalidation (before min-distance widening). */
  stop: number;
  structural_target: number;
  range: { high: number; low: number } | null;
  features: IntradayFeatures;
  score: number;
};

export type IntradayCandidate = IntradaySetupHit & {
  setup_bar_time: number;
  confirm_time: number;
  entry: number;
  stop: number;
  target: number;
  stop_distance: number;
  rr: number;
};

const fin = (x: number) => (Number.isFinite(x) ? x : null);
const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

type Range = { high: number; low: number; width: number; supportTests: number; resistanceTests: number };

/** Sideways range on bars [from, to] (inclusive): bounded width in ATRs, small net drift, both edges tested. */
export function tradingRange(s: TfSeries, from: number, to: number, atr: number, p: IntradayParams): Range | null {
  if (from < 1 || to <= from || !(atr > 0)) return null;
  let high = -Infinity;
  let low = Infinity;
  for (let k = from; k <= to; k++) {
    high = Math.max(high, s.bars[k].h);
    low = Math.min(low, s.bars[k].l);
  }
  const width = high - low;
  if (width < p.range_min_atr * atr || width > p.range_max_atr * atr) return null;
  if (Math.abs(s.bars[to].c - s.bars[from].c) > p.range_max_drift * width) return null;
  let supportTests = 0;
  let resistanceTests = 0;
  const band = 0.2 * width;
  for (let k = from; k <= to; k++) {
    if (s.bars[k].l <= low + band) supportTests += 1;
    if (s.bars[k].h >= high - band) resistanceTests += 1;
  }
  if (supportTests < 2 || resistanceTests < 2) return null;
  return { high, low, width, supportTests, resistanceTests };
}

export function features(s: TfSeries, i: number, range: Range | null = null): IntradayFeatures {
  const b = s.bars[i];
  const atr = s.atr[i];
  const spread = b.h - b.l;
  const vr = s.volSma[i] > 0 ? b.v / s.volSma[i] : NaN;
  const spreadAtr = atr > 0 ? spread / atr : NaN;
  return {
    volume_ratio: r3(fin(vr)),
    spread_atr: r3(fin(spreadAtr)),
    close_position: r3(spread > 0 ? (b.c - b.l) / spread : null),
    effort_vs_result: r3(fin(vr / Math.max(spreadAtr, 0.1))),
    range_width_atr: range && atr > 0 ? r3(range.width / atr) : null,
    range_support_tests: range?.supportTests ?? null,
    range_resistance_tests: range?.resistanceTests ?? null,
    rsi15: r3(fin(s.rsi[i])),
    above_ema200_15m: Number.isFinite(s.ema200[i]) ? b.c > s.ema200[i] : null,
    ema50_above_ema200_15m: Number.isFinite(s.ema200[i]) && Number.isFinite(s.ema50[i]) ? s.ema50[i] > s.ema200[i] : null,
    atr15_pct: r3(atr > 0 ? atr / b.c : null),
  };
}

/** Deterministic 0–100 quality score — recorded for analysis only (entries don't depend on it). */
export function scoreIntraday(setup: IntradaySetup, f: IntradayFeatures): number {
  let s = 40;
  if (f.close_position !== null && f.close_position >= 0.75) s += 10;
  if (f.above_ema200_15m) s += 10;
  if (f.ema50_above_ema200_15m) s += 10;
  if (setup === "WYCKOFF_SPRING" || setup === "WYCKOFF_LPS") {
    // Absorption: a test on LOW volume says supply is exhausted.
    if (f.volume_ratio !== null && f.volume_ratio < 1) s += 15;
    if ((f.range_support_tests ?? 0) >= 4) s += 10;
  } else {
    // Markup: effort must produce result (volume AND spread).
    if (f.volume_ratio !== null && f.volume_ratio >= 2) s += 15;
    if (f.effort_vs_result !== null && f.effort_vs_result <= 2) s += 10;
  }
  if (f.rsi15 !== null && f.rsi15 > 75) s -= 15;
  return Math.max(0, Math.min(100, s));
}

function closePos(b: Bar) {
  return b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5;
}

function hit(s: TfSeries, i: number, setup: IntradaySetup, stop: number, target: number, range: Range | null): IntradaySetupHit {
  const f = features(s, i, range);
  return { setup, i, stop, structural_target: target, range: range ? { high: range.high, low: range.low } : null, features: f, score: scoreIntraday(setup, f) };
}

function detectSpring(s: TfSeries, i: number, p: IntradayParams): IntradaySetupHit | null {
  const atr = s.atr[i];
  const range = tradingRange(s, i - 2 - p.range_bars, i - 3, atr, p);
  if (!range) return null;
  const b = s.bars[i];
  let minLow = Infinity;
  for (let k = i - 2; k <= i; k++) minLow = Math.min(minLow, s.bars[k].l);
  const pen = range.low - minLow;
  if (pen < 0.05 * atr || pen > p.spring_max_pen_atr * atr) return null;
  if (!(b.c > range.low && b.c < range.high && b.c > b.o && closePos(b) >= 0.5)) return null;
  return hit(s, i, "WYCKOFF_SPRING", minLow - p.stop_buffer_atr * atr, range.high, range);
}

function sosAt(s: TfSeries, k: number, p: IntradayParams): Range | null {
  const atr = s.atr[k];
  const range = tradingRange(s, k - p.range_bars, k - 1, atr, p);
  if (!range) return null;
  const b = s.bars[k];
  const vr = s.volSma[k] > 0 ? b.v / s.volSma[k] : 0;
  if (!(b.c > range.high && b.h - b.l >= p.sos_spread_atr * atr && vr >= p.sos_vol_mult && closePos(b) >= 0.7)) return null;
  return range;
}

function detectSos(s: TfSeries, i: number, p: IntradayParams): IntradaySetupHit | null {
  const range = sosAt(s, i, p);
  if (!range) return null;
  const b = s.bars[i];
  return hit(s, i, "WYCKOFF_SOS", b.l - p.stop_buffer_atr * s.atr[i], range.high + range.width, range);
}

function detectLps(s: TfSeries, i: number, p: IntradayParams): IntradaySetupHit | null {
  const atr = s.atr[i];
  const b = s.bars[i];
  for (let k = i - 2; k >= Math.max(1, i - p.lps_window); k--) {
    const range = sosAt(s, k, p);
    if (!range) continue;
    const mid = range.low + range.width / 2;
    let pullLow = Infinity;
    let pullVol = 0;
    let peak = s.bars[k].h;
    for (let j = k + 1; j <= i; j++) {
      if (s.bars[j].c < mid) return null;
      pullLow = Math.min(pullLow, s.bars[j].l);
      if (j < i) pullVol += s.bars[j].v;
      peak = Math.max(peak, s.bars[j].h);
    }
    const pullBars = i - k - 1;
    if (pullBars < 1 || pullVol / pullBars >= 0.7 * s.bars[k].v) return null;
    if (!(pullLow <= range.high + 0.5 * atr && b.c > b.o && closePos(b) >= 0.6)) return null;
    return hit(s, i, "WYCKOFF_LPS", pullLow - p.stop_buffer_atr * atr, Math.max(peak, range.high + range.width), range);
  }
  return null;
}

function detectBreakout(s: TfSeries, i: number, p: IntradayParams): IntradaySetupHit | null {
  const b = s.bars[i];
  let prior = -Infinity;
  for (let k = i - p.breakout_lookback; k < i; k++) prior = Math.max(prior, s.bars[k].h);
  if (!(b.c > prior)) return null;
  const vr = s.volSma[i] > 0 ? b.v / s.volSma[i] : 0;
  if (vr < p.breakout_vol_mult || closePos(b) < 0.6 || !(b.c > s.ema50[i])) return null;
  let squeezed = false;
  for (let k = i - 6; k < i; k++) {
    const pr = percentileRank(s.bbWidth, k, 200);
    if (pr !== null && pr <= p.squeeze_pct) squeezed = true;
  }
  if (!squeezed) return null;
  let low = Infinity;
  for (let k = i - 3; k <= i; k++) low = Math.min(low, s.bars[k].l);
  return hit(s, i, "BREAKOUT_15M", low - p.stop_buffer_atr * s.atr[i], b.c + 2.5 * (b.c - low), null);
}

/** One setup per closed 15m bar — Wyckoff patterns take priority over the plain breakout. */
export function detectIntradaySetup(s: TfSeries, i: number, p: IntradayParams = INTRADAY_PARAMS): IntradaySetupHit | null {
  if (i < p.range_bars + 10 || i >= s.bars.length || !(s.atr[i] > 0) || !Number.isFinite(s.volSma[i])) return null;
  if (p.trend_filter && !(s.bars[i].c > s.ema200[i] && s.ema50[i] > s.ema200[i])) return null;
  const order: [IntradaySetup, (s: TfSeries, i: number, p: IntradayParams) => IntradaySetupHit | null][] = [
    ["WYCKOFF_SPRING", detectSpring],
    ["WYCKOFF_LPS", detectLps],
    ["WYCKOFF_SOS", detectSos],
    ["BREAKOUT_15M", detectBreakout],
  ];
  for (const [name, fn] of order) {
    if (!p.setups.includes(name)) continue;
    const h = fn(s, i, p);
    if (h) return h;
  }
  return null;
}

/**
 * 5m entry timing for a setup on 15m bar `hit.i`: the first closed 5m bar (inside the window) that closes up,
 * holds the setup bar's close and sits above its 5m EMA20. A 5m low through the stop first kills the setup.
 * Stop is widened (never tightened) to the minimum distance; target = max(structure, entry + min_rr × R).
 */
export function confirmOn5m(f: IntradayFrames, h: IntradaySetupHit, now: number, p: IntradayParams = INTRADAY_PARAMS): IntradayCandidate | null {
  const setupBar = f.s15.bars[h.i];
  const armedAt = setupBar.t + M15;
  const atr15 = f.s15.atr[h.i];
  const start = closedIdx(f.s5, armedAt) + 1;
  for (let j = start; j < Math.min(f.s5.bars.length, start + p.confirm_window_5m); j++) {
    const b = f.s5.bars[j];
    if (b.t < armedAt) continue;
    if (b.t + M5 > now) return null;
    if (b.l <= h.stop) return null;
    if (!(b.c > b.o && b.c >= setupBar.c && Number.isFinite(f.s5.ema20[j]) && b.c > f.s5.ema20[j])) continue;
    const plan = planAtPrice(b.c, h.stop, h.structural_target, atr15, p);
    if (!plan) return null;
    return { ...h, ...plan, setup_bar_time: setupBar.t, confirm_time: b.t + M5 };
  }
  return null;
}

/**
 * Long plan at `entry` against a structural stop: the stop is widened (never tightened) to the minimum distance,
 * the trade is rejected when structure is too far away (chasing), and the target is at least min_rr × R.
 */
export function planAtPrice(entry: number, structuralStop: number, structuralTarget: number, atr15: number, p: IntradayParams = INTRADAY_PARAMS) {
  if (!(entry > 0) || !(atr15 > 0) || !(structuralStop < entry)) return null;
  const stop = Math.min(structuralStop, entry - p.min_stop_atr * atr15, entry * (1 - p.min_stop_pct));
  const R = entry - stop;
  if (!(R > 0) || entry - structuralStop > p.max_stop_atr * atr15) return null;
  const target = Math.max(structuralTarget, entry + p.min_rr * R);
  return { entry, stop, target, stop_distance: R, rr: (target - entry) / R };
}

/** Live scan: setups on recent closed 15m bars whose 5m confirmation has already printed by `now`. */
export function scanIntraday(f: IntradayFrames, now: number, p: IntradayParams = INTRADAY_PARAMS): IntradayCandidate[] {
  const last = closedIdx(f.s15, now);
  if (last < 0) return [];
  const out: IntradayCandidate[] = [];
  // Setup bar + its confirmation window + slack for a late/missed tick.
  const oldestArmed = now - M15 - p.confirm_window_5m * M5 - M15;
  for (let i = last; i >= 0 && f.s15.bars[i].t >= oldestArmed; i--) {
    const h = detectIntradaySetup(f.s15, i, p);
    if (!h) continue;
    const c = confirmOn5m(f, h, now, p);
    if (c) out.push(c);
  }
  return out;
}
