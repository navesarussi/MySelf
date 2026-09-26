/**
 * Book every real (Alpaca demo) trade from its fills — the one-off companion of the per-tick settlement.
 *   node --env-file=.env.local --import tsx scripts/trading/settle-backfill.ts [--since 2026-09-01] [--dry]
 * Prints each trade's R and P&L before → after. Safe to re-run: a settled trade is skipped.
 */
import { settleBrokerTrades } from "../../lib/trading/broker/settle";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const since = Date.parse(arg("since") ?? "2026-09-01");
  const dryRun = process.argv.includes("--dry");
  const out = await settleBrokerTrades({ now: Date.now(), sinceMs: since, dryRun });
  for (const r of out.report) {
    const f = (x: number | null) => (x === null ? "—" : x.toFixed(2));
    console.log(`${r.symbol.padEnd(8)} R ${f(r.before_r).padStart(8)} → ${f(r.after_r).padStart(8)}   P&L ${f(r.before_pnl).padStart(10)} → ${f(r.after_pnl).padStart(10)}`);
  }
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  console.log(`${dryRun ? "[dry] " : ""}settled ${out.settled}, still open at the broker ${out.pending}; total P&L ${sum(out.report.map((r) => r.before_pnl ?? 0)).toFixed(2)} → ${sum(out.report.map((r) => r.after_pnl)).toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
