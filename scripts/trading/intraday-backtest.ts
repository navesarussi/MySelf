/**
 * Intraday (15m setup / 5m entry) sanity backtest on Binance crypto.
 *   npx tsx scripts/trading/intraday-backtest.ts <cache-dir> [--days 90]
 * Same pure functions as live (detectIntradaySetup → confirmOn5m → stepPosition on 5m bars).
 * One position per symbol at a time, no portfolio cap — this measures signal quality in R, not account growth.
 */
import fs from "node:fs";
import path from "node:path";
import { EXECUTION_RULES, SEED_UNIVERSE } from "../../lib/trading/config";
import { fetchBars } from "../../lib/trading/market-data";
import { computeStats } from "../../lib/trading/metrics";
import { newPendingPosition, realizedR, stepPosition } from "../../lib/trading/position";
import { closedIdx } from "../../lib/trading/strategy/series";
import { INTRADAY_PARAMS, M15, M5, buildIntradayFrames, confirmOn5m, detectIntradaySetup, type IntradayCandidate } from "../../lib/trading/strategy/intraday";
import type { Bar } from "../../lib/trading/types";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DIR = process.argv[2];
if (!DIR) throw new Error("usage: intraday-backtest.ts <cache-dir>");
const DAYS = Number(arg("days") ?? 90);
const now = Math.floor(Date.now() / M15) * M15;
const since = now - DAYS * 86_400_000;
fs.mkdirSync(DIR, { recursive: true });

async function load(symbol: string, provider: string, tf: "5m" | "15m"): Promise<Bar[]> {
  const file = path.join(DIR, `${symbol}-${tf}-${DAYS}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const bars = await fetchBars({ symbol, asset_class: "CRYPTO_ALT", provider_symbol: provider }, tf, since - 3 * 86_400_000, now);
  fs.writeFileSync(file, JSON.stringify(bars));
  return bars;
}

type Result = { symbol: string; setup: string; score: number; r: number; gross: number; stop_pct: number; closed_at: number; exit: string; bars: number; features?: unknown; mfe: number };

async function main() {
  const p = { ...INTRADAY_PARAMS, ...JSON.parse(arg("params") ?? "{}") };
  const results: Result[] = [];
  for (const u of SEED_UNIVERSE.filter((s) => s.asset_class !== "STOCK")) {
    const [b15, b5] = await Promise.all([load(u.symbol, u.provider_symbol, "15m"), load(u.symbol, u.provider_symbol, "5m")]);
    if (b15.length < 400 || b5.length < 400) continue;
    const f = buildIntradayFrames(b15, b5);
    let busyUntil = 0;
    for (let i = 0; i < f.s15.bars.length; i++) {
      if (f.s15.bars[i].t < since) continue;
      const h = detectIntradaySetup(f.s15, i, p);
      if (!h) continue;
      const c: IntradayCandidate | null = confirmOn5m(f, h, now, p);
      if (!c || c.confirm_time < busyUntil) continue;
      const pos = newPendingPosition({ asset_class: u.asset_class, entry: c.entry * (1 + p.entry_cushion), stop: c.stop, size: 1 });
      pos.exit_plan = "STRUCTURAL";
      pos.target_price = c.target;
      pos.initial_target_price = c.target;
      pos.breakeven_at_r = p.breakeven_at_r;
      pos.partial_fraction = 0;
      pos.trail_after_r = p.trail_after_r;
      pos.trail_mult = p.trail_mult_atr15;
      let j = closedIdx(f.s5, c.confirm_time) + 1;
      for (; j < f.s5.bars.length; j++) {
        const bar = f.s5.bars[j];
        const i15 = closedIdx(f.s15, bar.t);
        const timeUp = pos.state !== "PENDING" && pos.bars_held + 1 >= p.time_stop_bars_5m;
        stepPosition(pos, bar, { atr: i15 >= 0 ? f.s15.atr[i15] : NaN, force_exit_reason: timeUp ? "TIME_STOP" : undefined });
        if (pos.state === "CLOSED" || pos.state === "CANCELLED") break;
      }
      busyUntil = (f.s5.bars[Math.min(j, f.s5.bars.length - 1)]?.t ?? now) + M5;
      if (pos.state !== "CLOSED") continue;
      const riskUsd = pos.initial_size * pos.stop_distance;
      const slip = EXECUTION_RULES.ASSUMED_SLIPPAGE[u.asset_class];
      // Gross = before fees and assumed slippage (both legs) — separates signal quality from trading costs.
      const gross = realizedR(pos) + (pos.fees_paid + slip * pos.initial_size * ((pos.entry_price ?? 0) + (pos.exit_price ?? 0))) / riskUsd;
      results.push({ symbol: u.symbol, setup: c.setup, score: c.score, r: realizedR(pos), gross, stop_pct: pos.stop_distance / (pos.entry_price ?? 1), closed_at: pos.closed_at ?? now, exit: pos.exit_reason ?? "?", bars: pos.bars_held, features: c.features, mfe: pos.mfe_r });
    }
    process.stdout.write(`${u.symbol} `);
  }
  console.log();
  if (arg("dump")) fs.writeFileSync(arg("dump")!, JSON.stringify(results));
  const line = (name: string, list: Result[]) => {
    const s = computeStats(list.map((x) => ({ r: x.r, closed_at: x.closed_at })));
    return `${name.padEnd(18)} n=${String(s.trades).padStart(4)} /day=${(s.trades / DAYS).toFixed(1).padStart(5)} win=${(s.win_rate * 100).toFixed(0).padStart(3)}% exp=${s.expectancy_r.toFixed(3)}R PF=${Number(s.profit_factor ?? 0).toFixed(2)} gross=${(list.reduce((a, x) => a + x.gross, 0) / Math.max(1, list.length)).toFixed(3)}R stop=${((list.reduce((a, x) => a + x.stop_pct, 0) / Math.max(1, list.length)) * 100).toFixed(2)}% avgBars=${(list.reduce((a, x) => a + x.bars, 0) / Math.max(1, list.length)).toFixed(0)}`;
  };
  console.log(`intraday ${p.version} · ${DAYS}d · crypto ${SEED_UNIVERSE.filter((s) => s.asset_class !== "STOCK").length} symbols`);
  console.log(line("ALL", results));
  for (const s of p.setups) console.log(line(s, results.filter((x) => x.setup === s)));
  for (const [lo, hi] of [[0, 55], [55, 70], [70, 101]]) console.log(line(`score ${lo}-${hi - 1}`, results.filter((x) => x.score >= lo && x.score < hi)));
  const exits = new Map<string, number>();
  for (const x of results) exits.set(x.exit, (exits.get(x.exit) ?? 0) + 1);
  console.log("exits", Object.fromEntries(exits));
  const half = now - (DAYS / 2) * 86_400_000;
  console.log(line("first half", results.filter((x) => x.closed_at < half)));
  console.log(line("second half", results.filter((x) => x.closed_at >= half)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
