/**
 * Strategy v2 backtest from the CLI, with an in-sample / out-of-sample split.
 *   npx tsx scripts/trading/backtest.ts [--preset CRYPTO|STOCKS] [--years 3] [--split 2024-03-01]
 * The app's Backtests screen stores runs; this script is for research iterations.
 */
import { SEED_UNIVERSE } from "../../lib/trading/config";
import { FOMC_DATES } from "../../lib/trading/calendar-seed";
import { runBacktestV2, type V2Result } from "../../lib/trading/strategy/backtest-v2";
import { DEFAULT_V2_PARAMS } from "../../lib/trading/strategy/candidates";
import { loadFramesV2, warmStart } from "../../lib/trading/strategy/data-v2";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const fmt = (r: V2Result) =>
  `n=${r.stats.trades} win=${(r.stats.win_rate * 100).toFixed(0)}% exp=${r.stats.expectancy_r}R sharpe=${r.sharpe} dd=${(r.max_equity_dd_pct * 100).toFixed(1)}% ret=${(r.return_pct * 100).toFixed(1)}% | B&H sharpe=${r.benchmark_sharpe} dd=${((r.benchmark_max_dd_pct ?? 0) * 100).toFixed(0)}%`;

async function main() {
  const preset = arg("preset") ?? "CRYPTO";
  const years = Number(arg("years") ?? (preset === "STOCKS" ? 1.9 : 3));
  const symbols = SEED_UNIVERSE.filter((s) => (preset === "STOCKS" ? s.asset_class === "STOCK" : s.asset_class !== "STOCK"));
  const since = Date.now() - years * 365 * 86_400_000;
  const t0 = Date.now();
  const { frames, reference, skipped } = await loadFramesV2(symbols, since);
  const start = warmStart(frames, since);
  const end = Date.now();
  const split = arg("split") ? Date.parse(arg("split")!) : start + (end - start) / 2;
  console.log(`${frames.length} symbols loaded in ${((Date.now() - t0) / 1000).toFixed(0)}s; skipped ${JSON.stringify(skipped)}`);
  const run = (a: number, b: number) => runBacktestV2({ frames, reference, params: DEFAULT_V2_PARAMS, starting_equity: 100_000, start: a, end: b, calendar: FOMC_DATES });
  console.log(`IS  ${new Date(start).toISOString().slice(0, 10)}→${new Date(split).toISOString().slice(0, 10)}  ${fmt(run(start, split))}`);
  console.log(`OOS ${new Date(split).toISOString().slice(0, 10)}→${new Date(end).toISOString().slice(0, 10)}  ${fmt(run(split, end))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
