/**
 * Risk budget: the whole live book (BOOK_SLEEVES at the live caps, MODEL_ENVELOPE) at several risk scales,
 * 2016-26, NEXT_OPEN stock execution, real costs. One run per scale over the whole span; each period's CAGR,
 * Sharpe and max drawdown come from its slice of that equity curve (positions carry across period edges, as
 * they would live).
 *   ETF_DIR=tmp/claude-scratch/etf-max STOCK_DIR=tmp/claude-scratch/daily-all \
 *   node --max-old-space-size=12000 --import tsx scripts/trading/risk-budget.ts [scale …]
 * Decision rule (docs/trading/multi-strategy.md — risk budget): the largest scale whose max drawdown is ≤ 15%
 * in every period.
 */
import { MODEL_ENVELOPE, scaledSleeves } from "../../lib/trading/book/sleeves";
import { runBook } from "../../lib/trading/strategy/multi";
import { loadBook, PERIODS } from "./book-research";

type Point = { t: number; equity: number };

export function sliceStats(curve: Point[], from: number, to: number) {
  const pts = curve.filter((p) => p.t >= from && p.t <= to);
  if (pts.length < 2) return null;
  let peak = pts[0].equity;
  let dd = 0;
  const rets: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    peak = Math.max(peak, pts[i].equity);
    dd = Math.max(dd, 1 - pts[i].equity / peak);
    rets.push(pts[i].equity / pts[i - 1].equity - 1);
  }
  const years = (pts[pts.length - 1].t - pts[0].t) / (365 * 86_400_000);
  const perYear = pts.length / Math.max(years, 1e-9);
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length);
  return { cagr: (pts[pts.length - 1].equity / pts[0].equity) ** (1 / years) - 1, sharpe: sd > 0 ? (m / sd) * Math.sqrt(perYear) : 0, dd };
}

if (process.argv[1]?.endsWith("risk-budget.ts")) {
  const scales = process.argv.slice(2).map(Number).filter((x) => x > 0);
  // GROSS=0.8 also caps stock gross notional (the book's exposure lever — smaller risk per trade alone fills more slots).
  const gross = Number(process.env.GROSS) || MODEL_ENVELOPE.max_gross;
  const envelope = { ...MODEL_ENVELOPE, max_gross: gross };
  const assets = loadBook();
  const refs = { STOCKS: assets.find((a) => a.symbol === "SPY"), CRYPTO: assets.find((a) => a.symbol === "BTC") };
  const [, start] = PERIODS.find(([l]) => l === "ALL")!;
  const end = Date.now();
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
  for (const scale of scales.length ? scales : [1, 0.85, 0.75, 0.7, 0.6, 0.5]) {
    const t0 = Date.now();
    const r = runBook({ assets, references: refs, sleeves: scaledSleeves(scale), envelope, start, end, starting_equity: 100_000, stock_execution: "NEXT_OPEN" });
    const rows = PERIODS.map(([label, a, b]) => {
      const s = sliceStats(r.equity, a, Math.min(b, end));
      return s ? `${label} CAGR ${pct(s.cagr)} Sharpe ${s.sharpe.toFixed(2)} DD ${pct(s.dd)}` : `${label} —`;
    });
    console.log(`scale ${scale.toFixed(2)} gross ${gross} trades ${r.trades.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n  ${rows.join("\n  ")}`);
  }
}
