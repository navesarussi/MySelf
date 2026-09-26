import { createBarCache } from "./market-data";
import { roundMoney } from "./round";
import {
  getClosedTradesLite,
  getOpenTrades,
  getSettings,
  getUniverse,
  isAccountTrade,
  type TradeRow,
  type TradingSettings,
  type UniverseRow,
} from "./store";


/** Closed-trade shape the equity formula actually needs — satisfied by the lite projection. */
type ClosedPnl = Pick<TradeRow, "realized_pnl">;

/** Latest mark for open positions — 1h bar close, then live quote fallback. */
export async function lastPrices(trades: TradeRow[], universe: UniverseRow[]) {
  const cache = createBarCache();
  const out = new Map<string, number>();
  const { livePrice } = await import("./intraday-data");
  await Promise.all(
    [...new Set(trades.map((t) => t.symbol))].map(async (symbol) => {
      const u = universe.find((x) => x.symbol === symbol);
      if (!u) return;
      try {
        const bars = await cache.get(u, "1h", 6);
        const last = bars.at(-1);
        if (last) {
          out.set(symbol, last.c);
          return;
        }
      } catch {
        /* fall through to live quote */
      }
      const px = await livePrice({ symbol: u.symbol, asset_class: u.asset_class, provider_symbol: u.provider_symbol });
      if (px) out.set(symbol, px);
    })
  );
  return out;
}

export function equityFromTrades(
  settings: TradingSettings,
  accountOpen: TradeRow[],
  accountClosed: ClosedPnl[],
  prices: Map<string, number>
): number {
  const unrealized = accountOpen.reduce((s, t) => {
    const p = t.sim_state;
    if (p.entry_price === null) return s;
    return s + p.cash_flow + (prices.get(t.symbol) ?? p.entry_price) * p.size;
  }, 0);
  const realizedAll = accountClosed.reduce((s, t) => s + (t.realized_pnl ?? 0), 0);
  return roundMoney(settings.starting_equity + realizedAll + unrealized);
}

/**
 * Adopt the broker's equity figure — but only a real one.
 *
 * The tick uses the demo account's own equity because it can hold positions the
 * strategy does not know about. A bare `Number(acct.equity)` on a response that
 * is missing the field yields NaN, and NaN propagates into `peak_equity`, which
 * is persisted: `drawdownFromPeak` is then NaN forever and the master kill
 * switch can never trip again. One bad response, permanently disabled safety.
 */
export type BrokerEquity = { ok: true; equity: number } | { ok: false; reason: string };

export function brokerEquity(raw: unknown): BrokerEquity {
  const equity = typeof raw === "number" ? raw : Number(String(raw ?? "").trim() || NaN);
  if (!Number.isFinite(equity) || equity <= 0) {
    return { ok: false, reason: `alpaca_equity_unusable:${JSON.stringify(raw)?.slice(0, 40)}` };
  }
  return { ok: true, equity };
}

export type LiveEquityComputation = {
  equity: number;
  prices: Map<string, number>;
};

/** Live account equity with the prices used to mark open positions.
 *
 *  Closed trades come from the lite projection filtered server-side to the
 *  current phase: the full row carries heavy jsonb (sim_state, events, agent
 *  reasoning) that the equity sum never reads, and the unfiltered query walks
 *  every closed trade ever recorded. */
export async function computeLiveEquityWithPrices(settings: TradingSettings): Promise<LiveEquityComputation> {
  const [open, closed, universe] = await Promise.all([
    getOpenTrades(),
    getClosedTradesLite(settings.phase_started_at),
    getUniverse(),
  ]);
  const accountOpen = open.filter((t) => isAccountTrade(t, settings.phase));
  const accountClosed = closed.filter((t) => isAccountTrade(t, settings.phase));
  const prices = await lastPrices(accountOpen, universe);
  return { equity: equityFromTrades(settings, accountOpen, accountClosed, prices), prices };
}

/** Live account equity — same formula as the trading dashboard. */
export async function computeLiveEquity(settings: TradingSettings): Promise<number> {
  return (await computeLiveEquityWithPrices(settings)).equity;
}

export type LiveEquitySnapshot = {
  equity: number;
  starting_equity: number;
  peak_equity: number;
  kill_switch_active: boolean;
  phase: string;
  updated_at: string;
};

/** Canonical live equity payload for Home, Trading, and widgets. */
export async function getLiveEquitySnapshot(): Promise<LiveEquitySnapshot> {
  const settings = await getSettings();
  const equity = await computeLiveEquity(settings);
  const peak = Math.max(settings.peak_equity, equity);
  return {
    equity,
    starting_equity: settings.starting_equity,
    peak_equity: peak,
    kill_switch_active: settings.kill_switch_active,
    phase: settings.phase,
    updated_at: new Date().toISOString(),
  };
}

/** Settings + live equity in one pass, so callers never fetch trading_settings
 *  twice.
 *
 *  A null liveEquity makes shapeTradingSnapshot fall back to starting_equity,
 *  which looks like a real number on the dashboard — so `equityFailed` lets the
 *  caller say the figure is stale instead of showing it as current. */
export async function loadTradingSnapshot(): Promise<{
  settings: TradingSettings;
  liveEquity: number | null;
  equityFailed: boolean;
}> {
  const settings = await getSettings();
  try {
    return { settings, liveEquity: await computeLiveEquity(settings), equityFailed: false };
  } catch (err) {
    console.error("[trading] live equity", err instanceof Error ? err.message : err);
    return { settings, liveEquity: null, equityFailed: true };
  }
}
