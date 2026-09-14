/**
 * Deterministic backtest from the CLI (phase 1).
 *   npx tsx scripts/trading/backtest.ts [--years 3] [--mode SWING] [--symbols BTC,ETH,SOL]
 * Prints per-variant stats. Use the app's Backtests screen to store results.
 */
import { DEFAULT_STRATEGY_PARAMS, PAPER_STARTING_EQUITY } from "../../lib/trading/config";
import { runBacktestSuite, symbolsFromIds } from "../../lib/trading/backtest-data";
import { FOMC_DATES } from "../../lib/trading/calendar-seed";
import type { TradingMode } from "../../lib/trading/types";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const years = Number(arg("years") ?? 3);
  const mode = (arg("mode") ?? "SWING") as TradingMode;
  const symbols = symbolsFromIds(arg("symbols")?.split(","));
  const t0 = Date.now();
  const { history, results } = await runBacktestSuite({
    symbols,
    mode,
    years,
    params: DEFAULT_STRATEGY_PARAMS,
    starting_equity: PAPER_STARTING_EQUITY,
    calendar: FOMC_DATES,
  });
  console.log(`loaded ${history.symbols.length} symbols in ${((Date.now() - t0) / 1000).toFixed(1)}s; skipped:`, history.skipped);
  console.log(`range ${new Date(history.start).toISOString().slice(0, 10)} → ${new Date(history.end).toISOString().slice(0, 10)}`);
  for (const r of results) {
    const s = r.stats;
    console.log(
      `\n${r.variant}: trades=${s.trades} win=${(s.win_rate * 100).toFixed(1)}% exp=${s.expectancy_r}R total=${s.total_r}R PF=${s.profit_factor} maxDD=${s.max_drawdown_r}R`
    );
    console.log(
      `  return=${(r.return_pct * 100).toFixed(1)}% vs buy&hold=${r.benchmark_return_pct === null ? "n/a" : (r.benchmark_return_pct * 100).toFixed(1) + "%"} equityDD=${(r.max_equity_dd_pct * 100).toFixed(1)}% triggers=${r.triggers}`
    );
    console.log("  blocked:", r.blocked, "cancelled:", r.cancelled, "MC:", r.monte_carlo);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
