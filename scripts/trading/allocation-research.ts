/**
 * Allocation across sleeves (docs/superpowers/specs/2026-09-30-trading-phase2-edge-design.md §C): the live book
 * (BOOK_SLEEVES × risk_scale, MODEL_ENVELOPE) with and without inverse-vol sleeve weights and book vol targeting,
 * 2016-26, NEXT_OPEN, real costs. Adopt only if Sharpe improves in every period with max DD ≤ 15%.
 *   ETF_DIR=tmp/claude-scratch/etf-max STOCK_DIR=tmp/claude-scratch/daily-all \
 *   node --max-old-space-size=12000 --import tsx scripts/trading/allocation-research.ts
 */
import { MODEL_ENVELOPE, scaledSleeves } from "../../lib/trading/book/sleeves";
import { inverseVolWeights, stdev, volTargetMultiplier } from "../../lib/trading/strategy/allocation";
import { runBook, type StrategyId } from "../../lib/trading/strategy/multi";
import { loadBook, PERIODS } from "./book-research";
import { sliceStats } from "./risk-budget";

type Alloc = (s: StrategyId, st: { t: number; book: number[]; sleeves: Map<string, number[]> }) => number;

const RISK_SCALE = Number(process.env.RISK_SCALE) || 0.75;
const assets = loadBook();
const refs = { STOCKS: assets.find((a) => a.symbol === "SPY"), CRYPTO: assets.find((a) => a.symbol === "BTC") };
const [, start] = PERIODS.find(([l]) => l === "ALL")!;
const end = Date.now();
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

function run(label: string, allocation?: Alloc) {
  const t0 = Date.now();
  const r = runBook({ assets, references: refs, sleeves: scaledSleeves(RISK_SCALE), envelope: MODEL_ENVELOPE, start, end, starting_equity: 100_000, stock_execution: "NEXT_OPEN", allocation });
  const rets = r.equity.slice(1).map((p, i) => p.equity / r.equity[i].equity - 1);
  const rows = PERIODS.map(([l, a, b]) => {
    const s = sliceStats(r.equity, a, Math.min(b, end));
    return s ? `${l.padEnd(5)} CAGR ${pct(s.cagr)} Sharpe ${s.sharpe.toFixed(2)} DD ${pct(s.dd)}` : `${l} —`;
  });
  console.log(`\n=== ${label}  trades ${r.trades.length}  vol ${pct(stdev(rets) * Math.sqrt(365))}  (${((Date.now() - t0) / 1000).toFixed(0)}s)\n  ${rows.join("\n  ")}`);
  return stdev(rets) * Math.sqrt(365);
}

const baseVol = run(`baseline risk×${RISK_SCALE}`);
const vt = (lookback: number, target = baseVol): Alloc => (_s, st) => volTargetMultiplier(st.book, { target_annual: target, lookback, min: 0.5, max: 1.5, periods_per_year: 365 });
const iv = (lookback: number): Alloc => {
  let cacheT = -1;
  let w = new Map<string, number>();
  return (s, st) => {
    if (st.t !== cacheT) {
      w = inverseVolWeights(st.sleeves, { lookback, min: 0.5, max: 2 });
      cacheT = st.t;
    }
    return w.get(s) ?? 1;
  };
};
run("vol target 20d (target = baseline vol)", vt(20));
run("vol target 60d", vt(60));
run("inverse-vol sleeves 60d", iv(60));
run("inverse-vol sleeves 120d", iv(120));
const both = (a: Alloc, b: Alloc): Alloc => (s, st) => a(s, st) * b(s, st);
run("inverse-vol 60d × vol target 20d", both(iv(60), vt(20)));
