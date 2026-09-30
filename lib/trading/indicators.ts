import type { Bar } from "./types";

/** All series functions return arrays aligned to input; NaN until warm-up completes. */

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const toRsi = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = toRsi();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = toRsi();
  }
  return out;
}

function trueRange(bars: Bar[], i: number): number {
  const b = bars[i];
  if (i === 0) return b.h - b.l;
  const pc = bars[i - 1].c;
  return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
}

/** Wilder's ATR. */
export function atr(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (bars.length <= period) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trueRange(bars, i);
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < bars.length; i++) {
    prev = (prev * (period - 1) + trueRange(bars, i)) / period;
    out[i] = prev;
  }
  return out;
}

/** Wilder's ADX. */
export function adx(bars: Bar[], period = 14): number[] {
  const n = bars.length;
  const out = new Array<number>(n).fill(NaN);
  if (n <= period * 2) return out;
  let trS = 0;
  let pS = 0;
  let mS = 0;
  const dx: number[] = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const up = bars[i].h - bars[i - 1].h;
    const down = bars[i - 1].l - bars[i].l;
    const pdm = up > down && up > 0 ? up : 0;
    const mdm = down > up && down > 0 ? down : 0;
    const tr = trueRange(bars, i);
    if (i <= period) {
      trS += tr;
      pS += pdm;
      mS += mdm;
      if (i < period) continue;
    } else {
      trS = trS - trS / period + tr;
      pS = pS - pS / period + pdm;
      mS = mS - mS / period + mdm;
    }
    const pdi = trS === 0 ? 0 : (100 * pS) / trS;
    const mdi = trS === 0 ? 0 : (100 * mS) / trS;
    dx[i] = pdi + mdi === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / (pdi + mdi);
  }
  let sum = 0;
  for (let i = period; i < period * 2; i++) sum += dx[i];
  let prev = sum / period;
  out[period * 2 - 1] = prev;
  for (let i = period * 2; i < n; i++) {
    prev = (prev * (period - 1) + dx[i]) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * Most recent confirmed swing low at or before `idx`: a bar whose low is the lowest of
 * `wing` bars on each side. Returns null when none in lookback.
 */
export function lastSwingLow(bars: Bar[], idx: number, lookback: number, wing = 2): number | null {
  for (let i = idx - wing; i >= Math.max(wing, idx - lookback); i--) {
    const l = bars[i].l;
    let ok = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j !== i && bars[j].l < l) {
        ok = false;
        break;
      }
    }
    if (ok) return l;
  }
  return null;
}

export function lastSwingHigh(bars: Bar[], idx: number, lookback: number, wing = 2): number | null {
  let best: number | null = null;
  for (let i = idx - wing; i >= Math.max(wing, idx - lookback); i--) {
    const h = bars[i].h;
    let ok = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j !== i && bars[j].h > h) {
        ok = false;
        break;
      }
    }
    // Nearest resistance above the current close is what matters.
    if (ok && h > bars[idx].c && (best === null || h < best)) best = h;
  }
  return best;
}

/** Pearson correlation of simple returns over the last `n` aligned closes. */
export function returnCorrelation(a: number[], b: number[], n = 60): number | null {
  const len = Math.min(a.length, b.length);
  if (len < 20) return null;
  const start = Math.max(1, len - n);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = start; i < len; i++) {
    const ia = a.length - len + i;
    const ib = b.length - len + i;
    ra.push(a[ia] / a[ia - 1] - 1);
    rb.push(b[ib] / b[ib - 1] - 1);
  }
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

/** Aggregate lower-timeframe bars into buckets of `ms` aligned to UTC epoch. */
export function aggregateBars(bars: Bar[], ms: number): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    const t = Math.floor(b.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, b.h);
      last.l = Math.min(last.l, b.l);
      last.c = b.c;
      last.v += b.v;
    } else {
      out.push({ ...b, t });
    }
  }
  return out;
}
