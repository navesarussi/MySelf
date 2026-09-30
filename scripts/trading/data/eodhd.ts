/**
 * Survivorship-free US stock bars from EODHD (phase 2 — docs/superpowers/specs/2026-09-30-trading-phase2-edge-design.md).
 *   set -a; source .env.local; set +a            # EODHD_API_KEY
 *   npx tsx scripts/trading/data/eodhd.ts symbols   # active + delisted lists → OUT/symbols.json
 *   npx tsx scripts/trading/data/eodhd.ts sync      # one call per symbol, resumable → OUT/bars/<SYMBOL>.json
 *   npx tsx scripts/trading/data/eodhd.ts check     # data-quality gate vs tmp/claude-scratch/daily-all
 * Research then runs with STOCK_DIR=OUT/bars (crypto files are linked in from daily-all).
 */
import fs from "node:fs";
import path from "node:path";
import { adjustRows, compareReturns, researchSymbols, splitSeries, type EodRow, type ResearchSymbol, type SymbolRow } from "../../../lib/trading/research/eodhd-core";
import type { Bar } from "../../../lib/trading/types";

const OUT = process.env.EODHD_DIR ?? "tmp/claude-scratch/eodhd";
const BARS = path.join(OUT, "bars");
const OLD = process.env.OLD_DIR ?? "tmp/claude-scratch/daily-all";
const FROM = "2014-06-01";
const KEY = process.env.EODHD_API_KEY?.trim();
const MIN_BARS = 250;

async function get<T>(url: string, tries = 4): Promise<T> {
  for (let k = 0; ; k++) {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}api_token=${KEY}&fmt=json`);
    if (res.ok) return (await res.json()) as T;
    if (k >= tries || (res.status !== 429 && res.status < 500)) throw new Error(`eodhd ${res.status} ${url.replace(/api_token=[^&]+/, "")}`);
    await new Promise((r) => setTimeout(r, 2000 * (k + 1)));
  }
}

async function symbols() {
  const [active, delisted] = await Promise.all([
    get<SymbolRow[]>("https://eodhd.com/api/exchange-symbol-list/US"),
    get<SymbolRow[]>("https://eodhd.com/api/exchange-symbol-list/US?delisted=1"),
  ]);
  const u = researchSymbols(active, delisted);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "symbols.json"), JSON.stringify(u));
  console.log(`listed ${active.length} active / ${delisted.length} delisted → ${u.symbols.filter((s) => !s.delisted).length} + ${u.symbols.filter((s) => s.delisted).length} common stocks on main exchanges; ${u.collisions.length} reused tickers`);
}

function write(code: string, bars: Bar[]): number {
  // The latest piece keeps the ticker; earlier companies that used it become CODE~1, CODE~2 …
  const parts = splitSeries(bars).filter((p) => p.length >= MIN_BARS);
  parts.forEach((p, i) => {
    const name = i === parts.length - 1 ? code : `${code}~${parts.length - 1 - i}`;
    fs.writeFileSync(path.join(BARS, `${name}.json`), JSON.stringify(p));
  });
  return parts.length;
}

async function sync() {
  const { symbols: list } = JSON.parse(fs.readFileSync(path.join(OUT, "symbols.json"), "utf8")) as { symbols: ResearchSymbol[] };
  fs.mkdirSync(BARS, { recursive: true });
  for (const f of fs.readdirSync(OLD)) if (f.endsWith("-CRYPTO.json") && !fs.existsSync(path.join(BARS, f))) fs.copyFileSync(path.join(OLD, f), path.join(BARS, f));
  const doneFile = path.join(OUT, "done.txt");
  const done = new Set(fs.existsSync(doneFile) ? fs.readFileSync(doneFile, "utf8").split("\n").filter(Boolean) : []);
  const todo = list.filter((s) => !done.has(s.code));
  console.log(`${todo.length} to fetch (${done.size} done)`);
  let i = 0;
  let written = 0;
  let failed = 0;
  const t0 = Date.now();
  const worker = async () => {
    while (i < todo.length) {
      const s = todo[i++];
      const started = Date.now();
      try {
        const rows = await get<EodRow[]>(`https://eodhd.com/api/eod/${encodeURIComponent(s.code)}.US?from=${FROM}`);
        written += write(s.code, adjustRows(rows));
        fs.appendFileSync(doneFile, `${s.code}\n`);
      } catch (err) {
        failed += 1;
        if (failed < 20) console.error(`${s.code}: ${err instanceof Error ? err.message : err}`);
      }
      // 8 workers × ≥ 600 ms per call ≈ 800 calls/min, under the 1,000/min limit.
      await new Promise((r) => setTimeout(r, Math.max(0, 600 - (Date.now() - started))));
      if (i % 500 === 0) console.log(`${i}/${todo.length} · ${written} series · ${failed} failed · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`done: ${written} series written, ${failed} failed`);
}

function check() {
  const read = (f: string) => JSON.parse(fs.readFileSync(f, "utf8")) as Bar[];
  const { symbols: list, collisions } = JSON.parse(fs.readFileSync(path.join(OUT, "symbols.json"), "utf8")) as { symbols: ResearchSymbol[]; collisions: string[] };
  const files = fs.readdirSync(BARS).filter((f) => !f.endsWith("-CRYPTO.json"));
  const have = new Set(files.map((f) => f.replace(".json", "")));
  // 1) agreement with the Alpaca-based data on common symbols
  const stats: { n: number; median_abs_diff: number; share_over_1pct: number }[] = [];
  const bad: string[] = [];
  for (const f of fs.readdirSync(OLD)) {
    if (f.endsWith("-CRYPTO.json")) continue;
    const s = f.replace(".json", "");
    if (!have.has(s)) continue;
    const r = compareReturns(read(path.join(BARS, f)), read(path.join(OLD, f)));
    if (r.n < 100) continue;
    stats.push(r);
    if (r.median_abs_diff > 0.0005 || r.share_over_1pct > 0.01) bad.push(`${s} (${(r.share_over_1pct * 100).toFixed(1)}% days > 1%)`);
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  // 2) delisted coverage by year: series that end in that year (the company left the market)
  const delisted = new Set(list.filter((s) => s.delisted).map((s) => s.code));
  const endYear = new Map<number, number>();
  const aliveByYear = new Map<number, number>();
  for (const f of files) {
    const bars = read(path.join(BARS, f));
    const code = f.replace(".json", "").replace(/~\d+$/, "");
    const y0 = new Date(bars[0].t).getUTCFullYear();
    const y1 = new Date(bars[bars.length - 1].t).getUTCFullYear();
    for (let y = y0; y <= y1; y++) aliveByYear.set(y, (aliveByYear.get(y) ?? 0) + 1);
    if (delisted.has(code) || f.includes("~")) endYear.set(y1, (endYear.get(y1) ?? 0) + 1);
  }
  const years = [...aliveByYear.keys()].sort();
  const lines = [
    `# Data quality — EODHD vs Alpaca-based research data (${new Date().toISOString().slice(0, 10)})`,
    "",
    `- Symbols: ${list.length} (${delisted.size} delisted), series written: ${files.length}, reused tickers: ${collisions.length}`,
    `- Common symbols compared: ${stats.length}; median of per-symbol median |Δ daily return| ${(med(stats.map((s) => s.median_abs_diff)) * 100).toFixed(3)}%; median share of days off by > 1%: ${(med(stats.map((s) => s.share_over_1pct)) * 100).toFixed(2)}%`,
    `- Symbols failing the gate (median |Δ| > 0.05% or > 1% of days off by > 1%): ${bad.length}${bad.length ? ` — e.g. ${bad.slice(0, 15).join(", ")}` : ""}`,
    "",
    "| Year | Series alive | Series ending (delisted / reused) |",
    "|---|---|---|",
    ...years.map((y) => `| ${y} | ${aliveByYear.get(y)} | ${endYear.get(y) ?? 0} |`),
  ];
  console.log(lines.join("\n"));
  fs.writeFileSync(path.join(OUT, "quality.md"), lines.join("\n") + "\n");
}

const cmd = process.argv[2];
if (!KEY && cmd !== "check") throw new Error("EODHD_API_KEY missing (.env.local)");
(cmd === "symbols" ? symbols() : cmd === "sync" ? sync() : cmd === "check" ? Promise.resolve(check()) : Promise.reject(new Error("usage: symbols | sync | check"))).catch((e) => {
  console.error(e);
  process.exit(1);
});
