/**
 * Regenerates lib/trading/book/research-results.ts (the research shown on the app's backtests screen) from the LIVE
 * configuration: BOOK_SLEEVES × trading risk scale, MODEL_ENVELOPE, NEXT_OPEN stock execution, real costs.
 *   ETF_DIR=tmp/claude-scratch/etf-max STOCK_DIR=<bars> [BIASED_DIR=tmp/claude-scratch/daily-all] RISK_SCALE=0.75 \
 *   node --max-old-space-size=12000 --import tsx scripts/trading/research-export.ts
 * With BIASED_DIR set (survivorship-free STOCK_DIR), the same runs on the biased data fill `survivorship`.
 */
import fs from "node:fs";
import { MODEL_ENVELOPE, scaledSleeves } from "../../lib/trading/book/sleeves";
import { runBook, type BookResult, type MultiAsset, type Sleeve } from "../../lib/trading/strategy/multi";
import type { BookResearch, BookResearchPeriod } from "../../lib/trading/book/research-results";
import { loadBook, PERIODS } from "./book-research";
import { sliceStats } from "./risk-budget";

const RISK_SCALE = Number(process.env.RISK_SCALE) || 0.75;
const LABELS: Record<string, string> = { train: "2016-21", valid: "2022-24H1", hold: "2024H2+", ALL: "ALL" };
const end = Date.now();
const [, start] = PERIODS.find(([l]) => l === "ALL")!;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function run(assets: MultiAsset[], sleeves: Sleeve[]): BookResult {
  const refs = { STOCKS: assets.find((a) => a.symbol === "SPY"), CRYPTO: assets.find((a) => a.symbol === "BTC") };
  return runBook({ assets, references: refs, sleeves, envelope: MODEL_ENVELOPE, start, end, starting_equity: 100_000, stock_execution: "NEXT_OPEN" });
}

function periods(r: BookResult): BookResearchPeriod[] {
  return PERIODS.map(([label, a, b]) => {
    const to = Math.min(b, end);
    const s = sliceStats(r.equity, a, to);
    const tr = r.trades.filter((x) => x.closed_at >= a && x.closed_at <= to);
    const years = (to - a) / (365 * 86_400_000);
    return {
      period: LABELS[label] ?? label,
      cagr: r3(s?.cagr ?? 0),
      sharpe: s ? Math.round(s.sharpe * 100) / 100 : null,
      max_dd: r3(s?.dd ?? 0),
      trades_per_year: Math.round(tr.length / years),
      expectancy_r: r3(tr.length ? tr.reduce((x, t) => x + t.r, 0) / tr.length : 0),
      win_rate: r3(tr.length ? tr.filter((t) => t.r > 0).length / tr.length : 0),
    };
  });
}

function study(stockDir: string) {
  const assets = loadBook(undefined, stockDir);
  const sleeves = scaledSleeves(RISK_SCALE);
  const book = run(assets, sleeves);
  const alone = sleeves.map((s) => ({ id: s.def.id, r: run(assets, [s]) }));
  return { assets, book, alone };
}

const main = study(process.env.STOCK_DIR ?? "tmp/claude-scratch/daily-all");
const spy = main.assets.find((a) => a.symbol === "SPY")!;
const monthEnd = new Map<string, { book: number; spy: number }>();
const spyAt = (t: number) => {
  let c = NaN;
  for (const b of spy.d1.bars) if (b.t <= t) c = b.c;
  return c;
};
const spy0 = spyAt(main.book.equity[0].t);
for (const p of main.book.equity) monthEnd.set(new Date(p.t).toISOString().slice(0, 7), { book: r3(p.equity / 100_000), spy: r3(spyAt(p.t) / spy0) });

const out: BookResearch = {
  generated_at: new Date().toISOString().slice(0, 10),
  data: process.env.BIASED_DIR ? "clean" : "biased",
  config: { risk_scale: RISK_SCALE, max_gross: MODEL_ENVELOPE.max_gross },
  costs: "stocks 0.06%/side, ETFs 0.03%, crypto 0.3%; stock signals at the next open",
  sleeves: main.alone.map((x) => ({ id: x.id, periods: periods(x.r) })),
  book: periods(main.book),
  curve: [...monthEnd.entries()].map(([m, v]) => ({ m, ...v })),
};

if (process.env.BIASED_DIR) {
  const biased = study(process.env.BIASED_DIR);
  const all = (r: BookResult) => {
    const p = periods(r).find((x) => x.period === "ALL")!;
    return { cagr: p.cagr, sharpe: p.sharpe, max_dd: p.max_dd };
  };
  out.survivorship = [
    ...main.alone.map((x, i) => ({ id: x.id, biased: all(biased.alone[i].r), clean: all(x.r) })),
    { id: "BOOK", biased: all(biased.book), clean: all(main.book) },
  ];
}

const file = "lib/trading/book/research-results.ts";
const src = fs.readFileSync(file, "utf8");
const at = src.indexOf("export const BOOK_RESEARCH: BookResearch = ");
fs.writeFileSync(file, `${src.slice(0, at)}export const BOOK_RESEARCH: BookResearch = ${JSON.stringify(out)};\n`);
for (const p of out.book) console.log(`${p.period.padEnd(10)} CAGR ${(p.cagr * 100).toFixed(1)}% Sharpe ${p.sharpe} DD ${(p.max_dd * 100).toFixed(1)}% trades/yr ${p.trades_per_year}`);
for (const s of out.sleeves) {
  const a = s.periods.find((p) => p.period === "ALL")!;
  console.log(`  ${s.id.padEnd(15)} CAGR ${(a.cagr * 100).toFixed(1)}% Sharpe ${a.sharpe} DD ${(a.max_dd * 100).toFixed(1)}%`);
}
if (out.survivorship) for (const x of out.survivorship) console.log(`  tax ${x.id.padEnd(15)} CAGR ${(x.biased.cagr * 100).toFixed(1)}% → ${(x.clean.cagr * 100).toFixed(1)}%  Sharpe ${x.biased.sharpe} → ${x.clean.sharpe}`);
