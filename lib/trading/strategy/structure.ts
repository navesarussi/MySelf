import { confirmedSwings, type TfSeries } from "./series";

/** Market-structure reading the way a discretionary analyst does it: trend legs, levels, divergences. */

export type StructureState = "UPTREND" | "DOWNTREND" | "RANGE" | "UNCLEAR";

export function structureState(s: TfSeries, idx: number, lookback = 120): StructureState {
  const highs = confirmedSwings(s.swingHighs, idx, lookback);
  const lows = confirmedSwings(s.swingLows, idx, lookback);
  if (highs.length < 2 || lows.length < 2) return "UNCLEAR";
  const hh = highs[0].price > highs[1].price;
  const hl = lows[0].price > lows[1].price;
  const lh = highs[0].price < highs[1].price;
  const ll = lows[0].price < lows[1].price;
  if (hh && hl) return "UPTREND";
  if (lh && ll) return "DOWNTREND";
  return "RANGE";
}

export type Level = { price: number; touches: number; kind: "RESISTANCE" | "SUPPORT" };

/**
 * Horizontal levels = clusters of confirmed swing points within `tolAtr` × ATR.
 * Strength = number of touches. Levels above price are resistance, below are support.
 */
export function keyLevels(s: TfSeries, idx: number, lookback = 250, tolAtr = 0.6): Level[] {
  const a = s.atr[idx];
  if (!Number.isFinite(a) || idx < 0) return [];
  const pts = [...confirmedSwings(s.swingHighs, idx, lookback), ...confirmedSwings(s.swingLows, idx, lookback)].map((x) => x.price).sort((x, y) => x - y);
  const clusters: { sum: number; n: number; max: number }[] = [];
  for (const p of pts) {
    const last = clusters[clusters.length - 1];
    if (last && p - last.max <= tolAtr * a) {
      last.sum += p;
      last.n += 1;
      last.max = p;
    } else clusters.push({ sum: p, n: 1, max: p });
  }
  const close = s.bars[idx].c;
  return clusters.map((c) => {
    const price = c.sum / c.n;
    return { price, touches: c.n, kind: price > close ? "RESISTANCE" : "SUPPORT" };
  });
}

/** Nearest resistance above `price` with at least `minTouches` touches (null = blue sky). */
export function nextResistance(levels: Level[], price: number, minTouches = 1): Level | null {
  let best: Level | null = null;
  for (const l of levels) {
    if (l.price > price && l.touches >= minTouches && (best === null || l.price < best.price)) best = l;
  }
  return best;
}

/** Bearish divergence: last two confirmed swing highs make a higher high while RSI makes a lower high. */
export function bearishDivergence(s: TfSeries, idx: number, lookback = 60): boolean {
  const highs = confirmedSwings(s.swingHighs, idx, lookback);
  if (highs.length < 2) return false;
  const [a, b] = highs;
  return a.price > b.price && Number.isFinite(s.rsi[a.i]) && Number.isFinite(s.rsi[b.i]) && s.rsi[a.i] < s.rsi[b.i] - 3;
}

/** Most recent confirmed swing low below `price` (structural stop anchor). */
export function lastSwingLowBelow(s: TfSeries, idx: number, price: number, lookback = 60): number | null {
  for (const sw of confirmedSwings(s.swingLows, idx, lookback)) if (sw.price < price) return sw.price;
  return null;
}
