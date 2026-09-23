import { macd } from "../../indicators";
import { percentileRank, type TfSeries } from "../../strategy/series";
import { round } from "../../round";

const fin = (v: number): number | null => (Number.isFinite(v) ? v : null);

/** Volume z-score over the last `lookback` bars (code-only; not LLM). */
export function volumeZ(s: TfSeries, i: number, lookback = 20): number | null {
  if (i < lookback - 1) return null;
  let sum = 0;
  for (let k = i - lookback + 1; k <= i; k++) sum += s.bars[k].v;
  const mean = sum / lookback;
  let varSum = 0;
  for (let k = i - lookback + 1; k <= i; k++) varSum += (s.bars[k].v - mean) ** 2;
  const sd = Math.sqrt(varSum / lookback);
  if (sd === 0) return 0;
  return round((s.bars[i].v - mean) / sd, 3);
}

export type CommitteeFeatureExtras = {
  relative_strength?: number | null;
  squeeze_pct?: number | null;
};

/** Populate `COMMITTEE_FEATURE_KEYS` from a closed bar index on a precomputed series. */
export function committeeFeaturesFromSeries(
  s: TfSeries,
  i: number,
  extras: CommitteeFeatureExtras = {},
): Record<string, number | null> {
  if (i < 0 || i >= s.bars.length) {
    return Object.fromEntries(
      ["rsi", "macd_hist", "macd_signal", "ema20", "ema50", "ema200", "atr", "atr_pct", "adx", "volume_z", "relative_strength", "squeeze_pct"].map((k) => [k, null]),
    );
  }
  const { signal, hist } = macd(s.bars.map((b) => b.c));
  const atrv = s.atr[i];
  const close = s.bars[i].c;
  return {
    rsi: fin(s.rsi[i]) !== null ? round(s.rsi[i], 2) : null,
    macd_hist: fin(hist[i]) !== null ? round(hist[i], 6) : null,
    macd_signal: fin(signal[i]) !== null ? round(signal[i], 6) : null,
    ema20: fin(s.ema20[i]),
    ema50: fin(s.ema50[i]),
    ema200: fin(s.ema200[i]),
    atr: fin(atrv),
    atr_pct: fin(atrv > 0 ? atrv / close : NaN) !== null ? round(atrv / close, 4) : null,
    adx: fin(s.adx[i]) !== null ? round(s.adx[i], 2) : null,
    volume_z: volumeZ(s, i),
    relative_strength: extras.relative_strength ?? null,
    squeeze_pct: extras.squeeze_pct ?? percentileRank(s.bbWidth, i, 120),
  };
}
