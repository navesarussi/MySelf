/**
 * Multi-strategy research on daily bars (lib/trading/strategy/multi.ts — the same functions the live book runs).
 *   node --import tsx scripts/trading/multi-research.ts <dir> [--only MR_RSI2] [--book]
 * <dir> holds <SYMBOL>.json (stocks/ETFs, split-adjusted daily) and <SYMBOL>-CRYPTO.json (daily, UTC).
 * Periods follow docs/trading/research-2026-09.md: train → validation → holdout (touch the holdout last).
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildMultiAsset,
  cryptoTrend,
  mrIbs,
  mrRsi2,
  pullback,
  runBook,
  TREND,
  type MultiAsset,
  type Sleeve,
  type StrategyGroup,
} from "../../lib/trading/strategy/multi";
import type { Bar } from "../../lib/trading/types";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const DIR = process.argv[2];
if (!DIR) throw new Error("usage: multi-research.ts <dir>");

export const ETFS = new Set("SPY,QQQ,IWM,DIA,MDY,XLB,XLC,XLE,XLF,XLI,XLK,XLP,XLRE,XLU,XLV,XLY,SMH,SOXX,XBI,IBB,KRE,XRT,XHB,ITB,OIH,XOP,GDX,GDXJ,SIL,URA,TAN,ICLN,KWEB,FXI,EWZ,EWJ,EWG,EWU,EWY,EWT,INDA,EEM,EFA,VNQ,TLT,IEF,SHY,LQD,HYG,GLD,SLV,USO,UNG,DBC,DBA,ARKK,JETS,IYR,IGV,LIT,COPX,TQQQ,SOXL,IBIT".split(","));

function load(): MultiAsset[] {
  const out: MultiAsset[] = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    const bars = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Bar[];
    if (bars.length < 260) continue;
    if (f.endsWith("-CRYPTO.json")) {
      const s = f.replace("-CRYPTO.json", "");
      out.push(buildMultiAsset(s, s === "BTC" || s === "ETH" ? "CRYPTO_MAJOR" : "CRYPTO_ALT", "CRYPTO", bars));
    } else {
      const s = f.replace(".json", "");
      out.push(buildMultiAsset(s, "STOCK", (ETFS.has(s) ? "ETF" : "STOCKS") as StrategyGroup, bars));
    }
  }
  return out;
}

const PERIODS: [string, string, string][] = [
  ["train", "2016-10-01", "2021-12-31"],
  ["valid", "2022-01-01", "2024-06-30"],
  ["hold", "2024-07-01", "2026-12-31"],
  ["ALL", "2016-10-01", "2026-12-31"],
];

function report(name: string, sleeves: Sleeve[], assets: MultiAsset[], refs: Parameters<typeof runBook>[0]["references"]) {
  console.log(`\n=== ${name}`);
  for (const [label, a, b] of PERIODS) {
    const start = Date.parse(a);
    const end = Math.min(Date.parse(b), Date.now());
    const r = runBook({ assets, references: refs, sleeves, start, end, starting_equity: 100_000 });
    const years = (end - start) / (365 * 86_400_000);
    const s = r.stats;
    const per = r.by_strategy.map((g) => `${g.key}:${g.stats.trades}/${g.stats.expectancy_r >= 0 ? "+" : ""}${g.stats.expectancy_r.toFixed(2)}R`).join(" ");
    console.log(
      `${label.padEnd(6)} n=${String(s.trades).padStart(5)} /yr=${(s.trades / years).toFixed(0).padStart(4)} win=${(s.win_rate * 100).toFixed(0).padStart(3)}% exp=${s.expectancy_r.toFixed(3).padStart(6)}R PF=${Number(s.profit_factor ?? 0).toFixed(2)} CAGR=${(r.cagr * 100).toFixed(1).padStart(5)}% Sharpe=${String(r.sharpe ?? "—").padStart(5)} DD=${(r.max_dd * 100).toFixed(1).padStart(5)}%  ${per}`
    );
  }
}

async function main() {
  const assets = load();
  const refs = { STOCKS: assets.find((a) => a.symbol === "SPY"), CRYPTO: assets.find((a) => a.symbol === "BTC") };
  console.log(`${assets.length} assets: ${assets.filter((a) => a.group === "STOCKS").length} stocks, ${assets.filter((a) => a.group === "ETF").length} ETFs, ${assets.filter((a) => a.group === "CRYPTO").length} crypto`);
  const only = arg("only");
  const families: [string, Sleeve][] = [
    ["TREND", { def: TREND, risk_pct: 0.005, max_positions: 12 }],
    ["MR_RSI2", { def: mrRsi2(), risk_pct: 0.005, max_positions: 12 }],
    ["MR_IBS", { def: mrIbs(), risk_pct: 0.005, max_positions: 12 }],
    ["PULLBACK", { def: pullback(), risk_pct: 0.005, max_positions: 12 }],
    ["CRYPTO_TREND", { def: cryptoTrend(), risk_pct: 0.005, max_positions: 12 }],
  ];
  for (const [name, sleeve] of families) {
    if (only && only !== name) continue;
    report(`${name} alone`, [sleeve], assets, refs);
  }
  if (process.argv.includes("--book")) report("BOOK (all sleeves)", families.map(([, s]) => ({ ...s, max_positions: 6 })), assets, refs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
