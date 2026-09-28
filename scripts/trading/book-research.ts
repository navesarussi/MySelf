/**
 * Whole-book research: the live strategy defs (lib/trading/strategy/multi.ts) through runBook, NEXT_OPEN stock
 * execution, real costs. Stocks: daily-all (10y), ETFs: etf-max (dividend-adjusted), crypto: daily-all *-CRYPTO.
 *   ETF_DIR=… STOCK_DIR=… node --max-old-space-size=12000 --import tsx scripts/trading/book-research.ts [alone|book] [SLEEVE]
 * ETF_DIR: <SYMBOL>.json dividend-adjusted daily bars; STOCK_DIR: <SYMBOL>.json split-adjusted daily stock bars and
 * <SYMBOL>-CRYPTO.json daily crypto bars (docs/trading/multi-strategy.md — research method).
 */
import fs from "node:fs";
import {
  assetRotation,
  buildMultiAsset,
  cryptoTrend,
  etfMr,
  momentum,
  momPullback,
  pullback,
  reversal,
  runBook,
  type BookEnvelope,
  type BookResult,
  type MultiAsset,
  type Sleeve,
} from "../../lib/trading/strategy/multi";
import type { Bar } from "../../lib/trading/types";

const ETF_DIR = process.env.ETF_DIR ?? "etf-max";
const STOCK_DIR = process.env.STOCK_DIR ?? "daily-all";
const read = (f: string) => JSON.parse(fs.readFileSync(f, "utf8")) as Bar[];
const clean = (b: Bar[]) => b.filter((x) => x.o > 0 && x.h > 0 && x.l > 0 && x.c > 0).map((x) => ({ ...x, h: Math.max(x.h, x.o, x.c), l: Math.min(x.l, x.o, x.c) }));
export function loadBook(since = Date.parse("2014-06-01")): MultiAsset[] {
  const out: MultiAsset[] = [];
  const etfSet = new Set<string>();
  for (const f of fs.readdirSync(ETF_DIR)) {
    const s = f.replace(".json", "");
    etfSet.add(s);
    const bars = clean(read(`${ETF_DIR}/${f}`)).filter((b) => b.t >= since - 400 * 86_400_000);
    if (bars.length > 260) out.push(buildMultiAsset(s, "STOCK", "ETF", bars));
  }
  for (const f of fs.readdirSync(STOCK_DIR)) {
    if (f.endsWith("-CRYPTO.json")) {
      const s = f.replace("-CRYPTO.json", "");
      out.push(buildMultiAsset(s, s === "BTC" || s === "ETH" ? "CRYPTO_MAJOR" : "CRYPTO_ALT", "CRYPTO", clean(read(`${STOCK_DIR}/${f}`))));
      continue;
    }
    const s = f.replace(".json", "");
    if (etfSet.has(s)) continue;
    const bars = clean(read(`${STOCK_DIR}/${f}`));
    if (bars.length < 300) continue;
    out.push(buildMultiAsset(s, "STOCK", "STOCKS", bars));
  }
  return out;
}

export const PERIODS: [string, number, number][] = [
  ["train", Date.parse("2016-10-01"), Date.parse("2021-12-31")],
  ["valid", Date.parse("2022-01-01"), Date.parse("2024-06-30")],
  ["hold", Date.parse("2024-07-01"), Date.parse("2030-01-01")],
  ["ALL", Date.parse("2016-10-01"), Date.parse("2030-01-01")],
];

export const ENV: BookEnvelope = { max_positions: 60, max_open_risk: 0.2, max_notional: 0.2, max_gross: 2 };

export function line(label: string, r: BookResult, years: number) {
  const s = r.stats;
  const per = r.by_strategy.map((g) => `${g.key}:${g.stats.trades}/${g.stats.expectancy_r >= 0 ? "+" : ""}${g.stats.expectancy_r.toFixed(2)}R`).join(" ");
  return `${label.padEnd(6)} n=${String(s.trades).padStart(5)} /yr=${(s.trades / years).toFixed(0).padStart(4)} win=${(s.win_rate * 100).toFixed(0).padStart(3)}% exp=${s.expectancy_r.toFixed(3).padStart(6)}R CAGR=${(r.cagr * 100).toFixed(1).padStart(5)}% Sharpe=${String(r.sharpe ?? "—").padStart(5)} DD=${(r.max_dd * 100).toFixed(1).padStart(5)}%  ${per}`;
}

export function report(name: string, assets: MultiAsset[], sleeves: Sleeve[], env: BookEnvelope = ENV, periods = PERIODS) {
  const refs = { STOCKS: assets.find((a) => a.symbol === "SPY"), CRYPTO: assets.find((a) => a.symbol === "BTC") };
  console.log(`\n=== ${name}`);
  const out: Record<string, BookResult> = {};
  for (const [label, a, b] of periods) {
    const end = Math.min(b, Date.now());
    const r = runBook({ assets, references: refs, sleeves, envelope: env, start: a, end, starting_equity: 100_000, stock_execution: "NEXT_OPEN" });
    out[label] = r;
    console.log(line(label, r, (end - a) / (365 * 86_400_000)));
    const bl = Object.entries(r.blocked).filter(([k]) => k !== "ALREADY_IN_SYMBOL").map(([k, v]) => `${k}:${v}`).join(" ");
    if (bl) console.log(`       blocked ${bl}`);
  }
  return out;
}

export const SLEEVES: Record<string, Sleeve> = {
  CRYPTO_TREND: { def: cryptoTrend(), risk_pct: 0.005, max_positions: 6 },
  REVERSAL: { def: reversal(), risk_pct: 0.005, max_positions: 10 },
  MOM_PULLBACK: { def: momPullback(), risk_pct: 0.004, max_positions: 10 },
  ETF_MR: { def: etfMr(), risk_pct: 0.005, max_positions: 6 },
  MOMENTUM: { def: momentum(), risk_pct: 0.005, max_positions: 20 },
  ASSET_ROTATION: { def: assetRotation(), risk_pct: 0.005, max_positions: 5 },
  PULLBACK_OLD: { def: pullback(), risk_pct: 0.0015, max_positions: 12 },
};

if (process.argv[1]?.endsWith("book-research.ts")) {
  const t0 = Date.now();
  const assets = loadBook();
  console.log(`loaded ${assets.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const mode = process.argv[2] ?? "alone";
  const only = process.argv[3];
  if (mode === "alone") for (const [k, s] of Object.entries(SLEEVES)) if (!only || only === k) report(`${k} alone`, assets, [s]);
  if (mode === "book") report("BOOK", assets, Object.entries(SLEEVES).filter(([k]) => k !== "PULLBACK_OLD").map(([, s]) => s));
}
