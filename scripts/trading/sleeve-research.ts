/**
 * Candidate sleeve vs the live book (phase 2 §D). Alone, the live book, and the book + the candidate at a few
 * risk / slot settings, each by period; plus the daily-return correlation of the candidate alone with the book.
 * Rule: adopt only if the book's Sharpe improves in train, validation and holdout with max DD ≤ 15%.
 *   ETF_DIR=tmp/claude-scratch/etf-max STOCK_DIR=tmp/claude-scratch/daily-all \
 *   node --max-old-space-size=12000 --import tsx scripts/trading/sleeve-research.ts ETF_TREND
 */
import { MODEL_ENVELOPE, scaledSleeves } from "../../lib/trading/book/sleeves";
import { defFor, runBook, type BookResult, type Sleeve, type StrategyId } from "../../lib/trading/strategy/multi";
import { loadBook, PERIODS } from "./book-research";
import { sliceStats } from "./risk-budget";

const id = (process.argv[2] ?? "ETF_TREND") as StrategyId;
const RISK_SCALE = Number(process.env.RISK_SCALE) || 0.75;
const VARIANTS: [number, number][] = [[0.004, 10], [0.006, 10], [0.008, 17]];
const assets = loadBook();
const refs = { STOCKS: assets.find((a) => a.symbol === "SPY"), CRYPTO: assets.find((a) => a.symbol === "BTC") };
const [, start] = PERIODS.find(([l]) => l === "ALL")!;
const end = Date.now();
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
const run = (sleeves: Sleeve[]) => runBook({ assets, references: refs, sleeves, envelope: MODEL_ENVELOPE, start, end, starting_equity: 100_000, stock_execution: "NEXT_OPEN" });
const rets = (r: BookResult) => new Map(r.equity.slice(1).map((p, i) => [p.t, p.equity / r.equity[i].equity - 1]));

function show(label: string, r: BookResult) {
  const rows = PERIODS.map(([l, a, b]) => {
    const s = sliceStats(r.equity, a, Math.min(b, end));
    return s ? `${l.padEnd(5)} CAGR ${pct(s.cagr)} Sharpe ${s.sharpe.toFixed(2)} DD ${pct(s.dd)}` : `${l} —`;
  });
  const mine = r.trades.filter((x) => x.strategy === id);
  console.log(`\n=== ${label}  trades ${r.trades.length} (${id}: ${mine.length}, avg ${mine.length ? (mine.reduce((s, x) => s + x.r, 0) / mine.length).toFixed(2) : "—"}R)\n  ${rows.join("\n  ")}`);
}

const live = scaledSleeves(RISK_SCALE);
const base = run(live);
show(`live book (risk ×${RISK_SCALE})`, base);
const alone = run([{ def: defFor(id), risk_pct: 0.006, max_positions: 17 }]);
show(`${id} alone (0.6% × 17)`, alone);
const b = rets(base);
const x = [...rets(alone)].filter(([t]) => b.has(t));
const mean = (v: number[]) => v.reduce((s, y) => s + y, 0) / v.length;
const xs = x.map(([, v]) => v);
const bs = x.map(([t]) => b.get(t)!);
const mx = mean(xs);
const mb = mean(bs);
const corr = xs.reduce((s, v, i) => s + (v - mx) * (bs[i] - mb), 0) / Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0) * bs.reduce((s, v) => s + (v - mb) ** 2, 0));
console.log(`\ncorrelation of ${id} alone with the live book (daily): ${corr.toFixed(2)}`);
for (const [risk, slots] of VARIANTS) show(`book + ${id} ${(risk * 100).toFixed(1)}% × ${slots}`, run([...live, { def: defFor(id), risk_pct: risk * RISK_SCALE, max_positions: slots }]));
