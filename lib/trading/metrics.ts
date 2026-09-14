/** Performance statistics over closed trades expressed in R. Pure; shared by backtest, journal and gates. */

export type RTrade = {
  r: number;
  closed_at: number;
  reached_1r?: boolean;
  exit_reason?: string | null;
};

export type PerformanceStats = {
  trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  expectancy_r: number;
  total_r: number;
  avg_win_r: number;
  avg_loss_r: number;
  profit_factor: number | null;
  max_drawdown_r: number;
  max_win_streak: number;
  max_loss_streak: number;
  reached_1r_rate: number;
  /** 95% Wilson interval for win rate — makes small samples visibly uncertain. */
  win_rate_ci: [number, number];
  sqn: number | null;
};

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export function wilsonInterval(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [round(Math.max(0, (centre - margin) / denom)), round(Math.min(1, (centre + margin) / denom))];
}

export function computeStats(trades: RTrade[]): PerformanceStats {
  const sorted = [...trades].sort((a, b) => a.closed_at - b.closed_at);
  const rs = sorted.map((t) => t.r);
  const n = rs.length;
  const winsArr = rs.filter((r) => r > 0);
  const lossArr = rs.filter((r) => r <= 0);
  const total = rs.reduce((s, r) => s + r, 0);
  const grossWin = winsArr.reduce((s, r) => s + r, 0);
  const grossLoss = -lossArr.reduce((s, r) => s + r, 0);

  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  let ws = 0;
  let ls = 0;
  let maxWs = 0;
  let maxLs = 0;
  for (const r of rs) {
    cum += r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
    if (r > 0) {
      ws += 1;
      ls = 0;
    } else {
      ls += 1;
      ws = 0;
    }
    maxWs = Math.max(maxWs, ws);
    maxLs = Math.max(maxLs, ls);
  }
  const mean = n ? total / n : 0;
  const sd = n > 1 ? Math.sqrt(rs.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1)) : 0;

  return {
    trades: n,
    wins: winsArr.length,
    losses: lossArr.length,
    win_rate: n ? round(winsArr.length / n) : 0,
    expectancy_r: round(mean),
    total_r: round(total),
    avg_win_r: winsArr.length ? round(grossWin / winsArr.length) : 0,
    avg_loss_r: lossArr.length ? round(-grossLoss / lossArr.length) : 0,
    profit_factor: grossLoss > 0 ? round(grossWin / grossLoss) : grossWin > 0 ? null : 0,
    max_drawdown_r: round(maxDd),
    max_win_streak: maxWs,
    max_loss_streak: maxLs,
    reached_1r_rate: n ? round(sorted.filter((t) => t.reached_1r).length / n) : 0,
    win_rate_ci: wilsonInterval(winsArr.length, n),
    sqn: n > 1 && sd > 0 ? round((Math.sqrt(Math.min(n, 100)) * mean) / sd, 2) : null,
  };
}

export function equityCurveR(trades: RTrade[]): { t: number; cum_r: number }[] {
  let cum = 0;
  return [...trades]
    .sort((a, b) => a.closed_at - b.closed_at)
    .map((tr) => {
      cum += tr.r;
      return { t: tr.closed_at, cum_r: round(cum, 3) };
    });
}

/** Histogram of R outcomes in 0.5R bins, clamped to [-2, +4]. */
export function rDistribution(trades: RTrade[]): { bin: number; count: number }[] {
  const bins = new Map<number, number>();
  for (let b = -2; b <= 4; b += 0.5) bins.set(b, 0);
  for (const t of trades) {
    const b = Math.min(4, Math.max(-2, Math.floor(t.r * 2) / 2));
    bins.set(b, (bins.get(b) ?? 0) + 1);
  }
  return [...bins.entries()].map(([bin, count]) => ({ bin, count }));
}

/** Deterministic PRNG so Monte Carlo results are reproducible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type MonteCarloResult = {
  runs: number;
  max_dd_r_p50: number;
  max_dd_r_p95: number;
  final_r_p5: number;
  final_r_p50: number;
  /** DD as % of equity at the given per-trade risk fraction (compounding ignored). */
  max_dd_pct_p95: number;
  prob_kill_switch: number;
};

/** Bootstrap resample of trade R sequence to estimate drawdown tails. */
export function monteCarlo(rs: number[], riskPerTrade: number, runs = 1000, seed = 42): MonteCarloResult {
  if (rs.length === 0) {
    return { runs: 0, max_dd_r_p50: 0, max_dd_r_p95: 0, final_r_p5: 0, final_r_p50: 0, max_dd_pct_p95: 0, prob_kill_switch: 0 };
  }
  const rand = mulberry32(seed);
  const dds: number[] = [];
  const finals: number[] = [];
  let kills = 0;
  for (let run = 0; run < runs; run++) {
    let cum = 0;
    let peak = 0;
    let dd = 0;
    let equity = 1;
    let peakEq = 1;
    let killed = false;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[Math.floor(rand() * rs.length)];
      cum += r;
      peak = Math.max(peak, cum);
      dd = Math.max(dd, peak - cum);
      equity *= 1 + r * riskPerTrade;
      peakEq = Math.max(peakEq, equity);
      if (1 - equity / peakEq >= 0.15) killed = true;
    }
    if (killed) kills += 1;
    dds.push(dd);
    finals.push(cum);
  }
  const pct = (arr: number[], q: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return round(s[Math.min(s.length - 1, Math.floor(q * s.length))], 2);
  };
  const dd95 = pct(dds, 0.95);
  return {
    runs,
    max_dd_r_p50: pct(dds, 0.5),
    max_dd_r_p95: dd95,
    final_r_p5: pct(finals, 0.05),
    final_r_p50: pct(finals, 0.5),
    max_dd_pct_p95: round(1 - Math.pow(1 - riskPerTrade, dd95), 4),
    prob_kill_switch: round(kills / runs, 3),
  };
}

export type GroupStat = { key: string; stats: PerformanceStats };

export function groupStats<T extends RTrade>(trades: T[], keyOf: (t: T) => string): GroupStat[] {
  const groups = new Map<string, T[]>();
  for (const t of trades) {
    const k = keyOf(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, stats: computeStats(list) }))
    .sort((a, b) => b.stats.trades - a.stats.trades);
}
