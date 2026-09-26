import type { LiveEquitySnapshot } from "./trading/account-equity";

export type HomeFinanceSnapshot = {
  month: string;
  net_actual: number;
  uncategorized_count: number;
};

export type HomeTradingSnapshot = {
  phase: string;
  equity: number;
  starting_equity: number;
  kill_switch_active: boolean;
};

/** Legacy /api/v1/home `trading` object — same fields older mobile builds expect. */
export const HOME_TRADING_LEGACY_FIELDS = [
  "phase",
  "equity",
  "starting_equity",
  "kill_switch_active",
] as const satisfies readonly (keyof HomeTradingSnapshot)[];

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Map canonical live equity into the legacy home payload trading slice. */
export function homeTradingFromLiveSnapshot(snap: LiveEquitySnapshot): HomeTradingSnapshot {
  return {
    phase: snap.phase,
    equity: snap.equity,
    starting_equity: snap.starting_equity,
    kill_switch_active: snap.kill_switch_active,
  };
}

export function shapeTradingSnapshot(
  row: Record<string, unknown> | null | undefined,
  liveEquity?: number | null
): HomeTradingSnapshot | null {
  if (!row) return null;
  const start = Number(row.starting_equity);
  const starting_equity = Number.isFinite(start) ? start : 0;
  const equity = Number.isFinite(liveEquity) ? liveEquity! : starting_equity;
  return {
    phase: typeof row.phase === "string" && row.phase ? row.phase : "BACKTEST",
    equity,
    starting_equity,
    kill_switch_active: Boolean(row.kill_switch_active),
  };
}
