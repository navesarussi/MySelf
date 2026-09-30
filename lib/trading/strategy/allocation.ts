/**
 * Risk allocation across the book's sleeves (research: scripts/trading/allocation-research.ts). Pure — the
 * research engine (runBook) and, if adopted, the live passes use the same functions. Both return multipliers on a
 * sleeve's research risk_pct; with too little history they are neutral (1).
 */

export function stdev(xs: number[]): number {
  if (!xs.length) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export type VolTargetParams = { target_annual: number; lookback: number; min: number; max: number; periods_per_year: number };

/** Book-wide: target annual vol ÷ realized vol of the last `lookback` daily book returns. */
export function volTargetMultiplier(bookReturns: number[], p: VolTargetParams): number {
  if (bookReturns.length < p.lookback) return 1;
  const sd = stdev(bookReturns.slice(-p.lookback)) * Math.sqrt(p.periods_per_year);
  if (!(sd > 0)) return p.max;
  return clamp(p.target_annual / sd, p.min, p.max);
}

export type InverseVolParams = { lookback: number; min: number; max: number };

/**
 * Per sleeve: (1/σ) normalized so the sleeves with enough history average 1 — total risk stays where it was,
 * it moves from the volatile sleeves to the calm ones. σ is the sleeve's daily P&L as a share of book equity.
 */
export function inverseVolWeights(sleeveReturns: Map<string, number[]>, p: InverseVolParams): Map<string, number> {
  const inv = new Map<string, number>();
  for (const [id, rs] of sleeveReturns) {
    if (rs.length < p.lookback) continue;
    const sd = stdev(rs.slice(-p.lookback));
    if (sd > 0) inv.set(id, 1 / sd);
  }
  const mean = inv.size ? [...inv.values()].reduce((a, b) => a + b, 0) / inv.size : 0;
  const out = new Map<string, number>();
  for (const id of sleeveReturns.keys()) {
    const v = inv.get(id);
    out.set(id, v === undefined || !(mean > 0) ? 1 : clamp(v / mean, p.min, p.max));
  }
  return out;
}
