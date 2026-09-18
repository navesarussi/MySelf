import { createBarCache } from "./market-data";
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

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Closed-trade shape the equity formula actually needs — satisfied by the lite projection. */
type ClosedPnl = Pick<TradeRow, "realized_pnl">;

async function lastPrices(trades: TradeRow[], universe: UniverseRow[]) {
  const cache = createBarCache();
  const out = new Map<string, number>();
  await Promise.all(
    [...new Set(trades.map((t) => t.symbol))].map(async (symbol) => {
      const u = universe.find((x) => x.symbol === symbol);
      if (!u) return;
      try {
        const bars = await cache.get(u, "1h", 6);
        const last = bars.at(-1);
        if (last) out.set(symbol, last.c);
      } catch {
        /* price unavailable */
      }
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
  return round(settings.starting_equity + realizedAll + unrealized, 2);
}

/** Live account equity — same formula as the trading dashboard.
 *
 *  Closed trades come from the lite projection filtered server-side to the
 *  current phase: the full row carries heavy jsonb (sim_state, events, agent
 *  reasoning) that the equity sum never reads, and the unfiltered query walks
 *  every closed trade ever recorded. */
export async function computeLiveEquity(settings: TradingSettings): Promise<number> {
  const [open, closed, universe] = await Promise.all([
    getOpenTrades(),
    getClosedTradesLite(settings.phase_started_at),
    getUniverse(),
  ]);
  const accountOpen = open.filter((t) => isAccountTrade(t, settings.phase));
  const accountClosed = closed.filter((t) => isAccountTrade(t, settings.phase));
  const prices = await lastPrices(accountOpen, universe);
  return equityFromTrades(settings, accountOpen, accountClosed, prices);
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
