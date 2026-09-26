import { equityFromTrades } from "./account-equity";
import { lookbackForClass, type BarCache } from "./market-data";
import { weekStartIso, type AccountRiskState } from "./risk-envelope";
import { framesFromBars } from "./strategy/data-v2";
import type { SymbolFrames } from "./strategy/candidates";
import { getClosedTradesLite, isAccountTrade, type TradeRow, type TradingSettings, type UniverseRow } from "./store";
import type { UniverseSymbol } from "./types";

/**
 * The pieces every stage of the tick shares: timing constants, the per-tick bar
 * caches, the summary it fills in, and the account the risk envelope sizes
 * against.
 *
 * Split out of engine.ts so the stages (advance, screen, scan, learn) can live
 * in their own files without importing the tick back and forming a cycle.
 */

export const H1 = 3_600_000;
export const H4 = 4 * H1;
export const D1 = 24 * H1;

export const TICK_TIME_BUDGET_MS = 240_000;
export const MAX_AGENT_CALLS_PER_TICK = 10;
export const MAX_LESSONS_PER_TICK = 3;
export const LESSONS_PER_PLAYBOOK = 8;
export const CHART_BARS_BEFORE = 120;
export const CHART_BARS_MAX = 400;

export const iso = (ms: number) => new Date(ms).toISOString();

export type TickSummary = {
  phase: string;
  positions_updated: number;
  closed: number;
  triggers: number;
  entries: number;
  vetoed: number;
  blocked: number;
  agent_calls: number;
  lessons: number;
  extensions: number;
  playbook_version: number | null;
  screened: boolean;
  errors: string[];
  skipped_reason?: string;
  duration_ms?: number;
};

export function toSym(u: Pick<UniverseRow, "symbol" | "asset_class" | "provider_symbol">): UniverseSymbol {
  return { symbol: u.symbol, asset_class: u.asset_class, provider_symbol: u.provider_symbol };
}

export function barsFor(cache: BarCache, sym: UniverseSymbol, tf: "1h" | "1d") {
  return cache.get(sym, tf, lookbackForClass(sym.asset_class, tf));
}

/** Per-tick memo of multi-timeframe frames. */
export function createFrameCache(cache: BarCache) {
  const memo = new Map<string, Promise<SymbolFrames | null>>();
  return (sym: UniverseSymbol) => {
    let p = memo.get(sym.symbol);
    if (!p) {
      p = Promise.all([barsFor(cache, sym, "1h"), barsFor(cache, sym, "1d")]).then(([h1, d1]) => (h1.length > 300 && d1.length > 220 ? framesFromBars(sym, h1, d1) : null));
      memo.set(sym.symbol, p);
    }
    return p;
  };
}
export type FrameCache = ReturnType<typeof createFrameCache>;

// ── Account ─────────────────────────────────────────────────────────────────

export type Account = {
  equity: number;
  /** Realized R today / this week — per-trade quality, not an account limit (trade sizes differ). */
  realizedToday: number;
  realizedWeek: number;
  /** Realized P&L in USD today / this week — what the account halts are measured on. */
  realizedPnlToday: number;
  realizedPnlWeek: number;
  open: TradeRow[];
};

/**
 * Account state the envelope sizes and halts against.
 *
 * Equity comes from `equityFromTrades` — the one place the formula lives. The
 * tick used to carry its own copy of it, so the number that sizes a position
 * and the number on the dashboard could drift apart without anything failing.
 */
export async function loadAccount(settings: TradingSettings, openTrades: TradeRow[], lastPrices: Map<string, number>, now: number): Promise<Account> {
  const inPhase = (await getClosedTradesLite(settings.phase_started_at)).filter((t) => isAccountTrade(t, settings.phase));
  const today = new Date(now).toISOString().slice(0, 10);
  const week = weekStartIso(new Date(now));
  const open = openTrades.filter((t) => isAccountTrade(t, settings.phase));
  return {
    equity: equityFromTrades(settings, open, inPhase, lastPrices),
    realizedToday: inPhase.filter((t) => t.closed_at!.slice(0, 10) === today).reduce((s, t) => s + (t.realized_r ?? 0), 0),
    realizedWeek: inPhase.filter((t) => weekStartIso(new Date(t.closed_at!)) === week).reduce((s, t) => s + (t.realized_r ?? 0), 0),
    realizedPnlToday: inPhase.filter((t) => t.closed_at!.slice(0, 10) === today).reduce((s, t) => s + (t.realized_pnl ?? 0), 0),
    realizedPnlWeek: inPhase.filter((t) => weekStartIso(new Date(t.closed_at!)) === week).reduce((s, t) => s + (t.realized_pnl ?? 0), 0),
    open,
  };
}

/** USD still at risk on an open or pending trade: size × (entry − stop) while the stop is below the entry. */
export function openRiskUsd(t: Pick<TradeRow, "sim_state" | "entry_limit" | "remaining_size">): number {
  const p = t.sim_state;
  if (p.state === "CLOSED" || p.state === "CANCELLED") return 0;
  const entry = p.entry_price ?? p.entry_limit ?? t.entry_limit;
  const size = p.state === "PENDING" ? p.initial_size : p.size;
  return entry > p.stop_price ? size * (entry - p.stop_price) : 0;
}

/** The live account as the %-of-equity envelope sees it (checkAccountEntry). */
export function accountRiskState(settings: TradingSettings, account: Account, extraOpen: { symbol: string }[] = []): AccountRiskState {
  return {
    equity: account.equity,
    peak_equity: Math.max(settings.peak_equity, account.equity),
    realized_pnl_today: account.realizedPnlToday,
    realized_pnl_week: account.realizedPnlWeek,
    kill_switch_active: settings.kill_switch_active,
    entries_paused: settings.entries_paused,
    positions: [
      ...account.open.map((t) => ({ symbol: t.symbol, notional: t.entry_limit * t.remaining_size, open_risk_usd: openRiskUsd(t) })),
      ...extraOpen.map((x) => ({ symbol: x.symbol, notional: 0, open_risk_usd: 0 })),
    ],
  };
}
