import { adx, atr, ema, rsi, sma } from "../indicators";
import type { Bar } from "../types";

/**
 * Per-timeframe precomputed series. Everything is indexed by bar and only ever read at a
 * CLOSED index (`closedIdx`), so the same code is look-ahead free in backtests and live.
 */
export type TfSeries = {
  bars: Bar[];
  ms: number;
  ema20: number[];
  ema50: number[];
  ema200: number[];
  rsi: number[];
  atr: number[];
  adx: number[];
  volSma: number[];
  /** Bollinger band width / close (20, 2σ). */
  bbWidth: number[];
  /** Swing points confirmed `SWING_WING` bars after they print. */
  swingHighs: { i: number; price: number }[];
  swingLows: { i: number; price: number }[];
};

export const SWING_WING = 3;

function stdev(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let m = 0;
    for (let k = i - period + 1; k <= i; k++) m += values[k];
    m /= period;
    let v = 0;
    for (let k = i - period + 1; k <= i; k++) v += (values[k] - m) ** 2;
    out[i] = Math.sqrt(v / period);
  }
  return out;
}

export function buildTfSeries(bars: Bar[], ms: number): TfSeries {
  const closes = bars.map((b) => b.c);
  const mid = sma(closes, 20);
  const sd = stdev(closes, 20);
  const swingHighs: TfSeries["swingHighs"] = [];
  const swingLows: TfSeries["swingLows"] = [];
  for (let i = SWING_WING; i < bars.length - SWING_WING; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = i - SWING_WING; k <= i + SWING_WING; k++) {
      if (k === i) continue;
      if (bars[k].h >= bars[i].h) isHigh = false;
      if (bars[k].l <= bars[i].l) isLow = false;
    }
    if (isHigh) swingHighs.push({ i, price: bars[i].h });
    if (isLow) swingLows.push({ i, price: bars[i].l });
  }
  return {
    bars,
    ms,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    ema200: ema(closes, 200),
    rsi: rsi(closes, 14),
    atr: atr(bars, 14),
    adx: adx(bars, 14),
    volSma: sma(bars.map((b) => b.v), 20),
    bbWidth: mid.map((m, i) => (Number.isFinite(m) && m > 0 ? (4 * sd[i]) / m : NaN)),
    swingHighs,
    swingLows,
  };
}

/** Index of the last bar whose close time is ≤ t, or -1. */
export function closedIdx(s: TfSeries, t: number): number {
  let lo = 0;
  let hi = s.bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.bars[mid].t + s.ms <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Swings already confirmed at index `idx`. */
export function confirmedSwings(list: { i: number; price: number }[], idx: number, lookback: number) {
  const out: { i: number; price: number }[] = [];
  for (let k = list.length - 1; k >= 0; k--) {
    const sw = list[k];
    if (sw.i + SWING_WING > idx) continue;
    if (sw.i < idx - lookback) break;
    out.push(sw);
  }
  return out; // newest first
}

export function percentileRank(values: number[], idx: number, lookback: number): number | null {
  const cur = values[idx];
  if (!Number.isFinite(cur)) return null;
  let below = 0;
  let n = 0;
  for (let k = Math.max(0, idx - lookback); k < idx; k++) {
    if (!Number.isFinite(values[k])) continue;
    n += 1;
    if (values[k] < cur) below += 1;
  }
  return n >= 20 ? below / n : null;
}
