/**
 * Before/after strategy metrics: raw (all closed AGENT trades) vs clean (measurable).
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/trading/measurable-report.ts
 *
 * Without DB credentials, runs on embedded fixtures and prints a note.
 */
import { computeStats, groupStats } from "../../lib/trading/metrics";
import { isMeasurableTrade, measurableR, partitionMeasurableTrades } from "../../lib/trading/measurable-trades";
import type { TradeRow } from "../../lib/trading/store";

type Row = Pick<
  TradeRow,
  | "strategy_version"
  | "track"
  | "execution"
  | "broker"
  | "reconciliation_kind"
  | "broker_settled_at"
  | "exit_price_confirmed"
  | "entry_price"
  | "broker_filled_qty"
  | "state"
  | "realized_r"
  | "realized_pnl"
  | "initial_stop_price"
  | "position_size"
  | "closed_at"
  | "created_at"
>;

function report(label: string, rows: Row[]) {
  const rt = rows.map((t) => ({
    r: measurableR(t),
    closed_at: Date.parse(t.closed_at ?? t.created_at ?? ""),
  }));
  const byStrategy = groupStats(
    rows.map((t) => ({
      strategy: t.strategy_version ?? "?",
      r: measurableR(t),
      closed_at: Date.parse(t.closed_at ?? t.created_at ?? ""),
    })),
    (x) => x.strategy
  );
  console.log(`\n=== ${label} (${rows.length} trades) ===`);
  const stats = computeStats(rt);
  console.log(`  expectancy_r: ${stats.expectancy_r.toFixed(3)}  win_rate: ${(stats.win_rate * 100).toFixed(1)}%  total_r: ${stats.total_r.toFixed(2)}`);
  for (const g of byStrategy.sort((a, b) => b.stats.trades - a.stats.trades)) {
    console.log(
      `  ${g.key}: ${g.stats.trades} trades  exp ${g.stats.expectancy_r >= 0 ? "+" : ""}${g.stats.expectancy_r.toFixed(3)}R  total ${g.stats.total_r.toFixed(2)}R  pnl Σ n/a`
    );
  }
}

function rawRReport(label: string, rows: Row[]) {
  const rt = rows.map((t) => ({ r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at ?? t.created_at ?? "") }));
  const byStrategy = groupStats(
    rows.map((t) => ({ strategy: t.strategy_version ?? "?", r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at ?? t.created_at ?? "") })),
    (x) => x.strategy
  );
  console.log(`\n=== ${label} (${rows.length} trades) ===`);
  const stats = computeStats(rt);
  console.log(`  expectancy_r: ${stats.expectancy_r.toFixed(3)}  win_rate: ${(stats.win_rate * 100).toFixed(1)}%  total_r: ${stats.total_r.toFixed(2)}`);
  for (const g of byStrategy.sort((a, b) => b.stats.trades - a.stats.trades)) {
    console.log(`  ${g.key}: ${g.stats.trades} trades  exp ${g.stats.expectancy_r >= 0 ? "+" : ""}${g.stats.expectancy_r.toFixed(3)}R  total ${g.stats.total_r.toFixed(2)}R`);
  }
}

const FIXTURES: Row[] = [
  {
    strategy_version: "intraday",
    track: "AGENT",
    execution: "PAPER",
    broker: "ALPACA_PAPER",
    reconciliation_kind: null,
    broker_settled_at: "2026-09-15T00:00:00Z",
    exit_price_confirmed: true,
    entry_price: 100,
    broker_filled_qty: 10,
    state: "CLOSED",
    realized_r: -42,
    realized_pnl: -4200,
    initial_stop_price: 99.5,
    position_size: 10,
    closed_at: "2026-09-15T16:00:00Z",
    created_at: "2026-09-15T10:00:00Z",
  },
  {
    strategy_version: "intraday",
    track: "AGENT",
    execution: "PAPER",
    broker: "ALPACA_PAPER",
    reconciliation_kind: null,
    broker_settled_at: null,
    exit_price_confirmed: false,
    entry_price: 50,
    broker_filled_qty: 5,
    state: "CLOSED",
    realized_r: -20,
    realized_pnl: -2000,
    initial_stop_price: 49.99,
    position_size: 5,
    closed_at: "2026-09-16T16:00:00Z",
    created_at: "2026-09-16T10:00:00Z",
  },
  {
    strategy_version: "reconciliation",
    track: "AGENT",
    execution: "PAPER",
    broker: "ALPACA_PAPER",
    reconciliation_kind: "orphan_close",
    broker_settled_at: null,
    exit_price_confirmed: null,
    entry_price: null,
    broker_filled_qty: null,
    state: "CLOSED",
    realized_r: null,
    realized_pnl: null,
    initial_stop_price: 99,
    position_size: 1,
    closed_at: "2026-09-28T16:00:00Z",
    created_at: "2026-09-28T16:00:00Z",
  },
] as Row[];

async function loadProd(): Promise<Row[] | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { db: { schema: "myself" } });
  const { data, error } = await sb
    .from("trading_trades")
    .select(
      "strategy_version, track, execution, broker, reconciliation_kind, broker_settled_at, exit_price_confirmed, entry_price, broker_filled_qty, state, realized_r, realized_pnl, initial_stop_price, position_size, closed_at, created_at"
    )
    .eq("state", "CLOSED")
    .eq("track", "AGENT")
    .order("closed_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

async function main() {
  const prod = await loadProd().catch((e) => {
    console.error("prod load failed:", e);
    return null;
  });
  const rows = prod ?? FIXTURES;
  if (!prod) console.log("\n(note: no SUPABASE_URL/SERVICE_ROLE_KEY — using fixtures)\n");

  const agent = rows.filter((t) => t.track === "AGENT");
  rawRReport("BEFORE (raw realized_r, all AGENT closed)", agent);
  const { measurable, excluded } = partitionMeasurableTrades(agent, "PAPER");
  report("AFTER (measurable + floored R)", measurable);
  console.log(`\nExcluded: ${excluded.length} (${excluded.map((t) => t.reconciliation_kind ?? t.exit_price_confirmed === false ? "est" : "unsettled").join(", ")})`);
}

main();
