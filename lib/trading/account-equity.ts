import { createBarCache } from "./market-data";
import {
  getClosedTrades,
  getOpenTrades,
  getSettings,
  getUniverse,
  isAccountTrade,
  type TradeRow,
  type TradingSettings,
  type UniverseRow,
} from "./store";

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

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
  accountClosed: TradeRow[],
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

/** Live account equity — same formula as the trading dashboard. */
export async function computeLiveEquity(settings: TradingSettings): Promise<number> {
  const [open, closed, universe] = await Promise.all([getOpenTrades(), getClosedTrades(), getUniverse()]);
  const accountOpen = open.filter((t) => isAccountTrade(t, settings.phase));
  const prices = await lastPrices(accountOpen, universe);
  const accountClosed = closed.filter(
    (t) => isAccountTrade(t, settings.phase) && t.closed_at && t.closed_at >= settings.phase_started_at
  );
  return equityFromTrades(settings, accountOpen, accountClosed, prices);
}
