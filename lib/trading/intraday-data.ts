import { isRegularSessionBar, latestStockPrices, stockBars } from "./broker/alpaca-data";
import { isAlpacaConfigured } from "./broker/alpaca";
import { fetchBars } from "./market-data";
import { M15, M5, buildIntradayFrames, type IntradayFrames } from "./strategy/intraday";
import { applyFetched, createTailCache, planRefresh, type TailCache } from "./intraday-bar-cache";
import type { AssetClass } from "./types";
import { mapWithConcurrency } from "@/lib/concurrency";
import { chunk } from "@/lib/db/paginate";

/**
 * Bars for the intraday strategy: crypto from Binance (per symbol), stocks from Alpaca (multi-symbol, IEX feed,
 * regular session only). Only CLOSED bars are kept, so live scanning has the same view as the backtest.
 */

const BARS_15M = 400;
const BARS_5M = 300;
const MIN_15M = 260;
const MIN_5M = 60;

export type IntradaySymbol = { symbol: string; asset_class: AssetClass; provider_symbol: string };
export type LoadedFrames = { sym: IntradaySymbol; f: IntradayFrames; lastPrice: number };

// Stocks: ~26 regular-session 15m bars/day → 400 bars ≈ 16 sessions ≈ 24 calendar days (+ holidays margin).
const STOCK_15M_DAYS = 30;
const STOCK_5M_DAYS = 8;
/** ~550 15m bars per symbol at ~800 bars per Alpaca page → ~18 pages per request, well inside MAX_PAGES. */
const STOCK_BATCH = 25;
/** Measured cold load of 151 stocks: 26s at 2, 20s at 4, 15s at 8 (~180 requests, under the 200/min data limit). */
const STOCK_CONCURRENCY = 8;
/** Re-read the newest cached bars in case the provider was still settling them. */
const STOCK_OVERLAP_BARS = 3;

/** Module scope: survives warm invocations, so a warm tick fetches minutes of bars instead of weeks. */
const stockCache = { m15: createTailCache(BARS_15M), m5: createTailCache(BARS_5M) };

/** Closed, regular-session bars only — applied at parse time so extended-hours bars never become objects. */
export function regularClosedBar(ms: number, now: number) {
  return (t: number) => t + ms <= now && isRegularSessionBar(t);
}

/** Refresh one timeframe of the stock cache. Returns the symbols whose batch failed (their cache is not current). */
async function refreshStockSeries(cache: TailCache, names: string[], tf: "15Min" | "5Min", ms: number, fullStart: number, now: number, errors: string[]): Promise<Set<string>> {
  const plan = planRefresh(cache, names, new Date(now).toISOString().slice(0, 10), fullStart, STOCK_OVERLAP_BARS * ms);
  const jobs = [...chunk(plan.cold, STOCK_BATCH).map((b) => ({ batch: b, cold: true })), ...chunk(plan.warm, STOCK_BATCH).map((b) => ({ batch: b, cold: false }))];
  const failed = new Set<string>();
  await mapWithConcurrency(jobs, STOCK_CONCURRENCY, async ({ batch, cold }) => {
    try {
      const fetched = await stockBars(batch, tf, cold ? fullStart : plan.warmStart, { feed: "iex", keep: regularClosedBar(ms, now), tail: cache.tail });
      applyFetched(cache, fetched, batch, cold);
    } catch (err) {
      for (const s of batch) failed.add(s);
      errors.push(`stock bars ${tf}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
    }
  });
  return failed;
}

export async function loadIntradayFrames(symbols: IntradaySymbol[], now: number, errors: string[]): Promise<Map<string, LoadedFrames>> {
  const out = new Map<string, LoadedFrames>();
  const crypto = symbols.filter((s) => s.asset_class !== "STOCK");
  const stocks = symbols.filter((s) => s.asset_class === "STOCK");

  await mapWithConcurrency(crypto, 8, async (sym) => {
    try {
      const [b15, b5] = await Promise.all([fetchBars(sym, "15m", now - BARS_15M * M15, now), fetchBars(sym, "5m", now - BARS_5M * M5, now)]);
      if (b15.length < MIN_15M || b5.length < MIN_5M) return;
      out.set(sym.symbol, { sym, f: buildIntradayFrames(b15, b5), lastPrice: b5[b5.length - 1].c });
    } catch (err) {
      errors.push(`bars ${sym.symbol}: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
    }
  });

  if (stocks.length && isAlpacaConfigured()) {
    const names = stocks.map((s) => s.provider_symbol);
    const [f15, f5] = await Promise.all([
      refreshStockSeries(stockCache.m15, names, "15Min", M15, now - STOCK_15M_DAYS * 86_400_000, now, errors),
      refreshStockSeries(stockCache.m5, names, "5Min", M5, now - STOCK_5M_DAYS * 86_400_000, now, errors),
    ]);
    for (const sym of stocks) {
      if (f15.has(sym.provider_symbol) || f5.has(sym.provider_symbol)) continue;
      const b15 = stockCache.m15.series.get(sym.provider_symbol) ?? [];
      const b5 = stockCache.m5.series.get(sym.provider_symbol) ?? [];
      if (b15.length < MIN_15M || b5.length < MIN_5M) continue;
      out.set(sym.symbol, { sym, f: buildIntradayFrames(b15, b5), lastPrice: b5[b5.length - 1].c });
    }
  }
  return out;
}

/** Latest tradable price: Binance last trade for crypto, Alpaca IEX last trade for stocks. */
export async function livePrice(sym: IntradaySymbol): Promise<number | null> {
  try {
    if (sym.asset_class === "STOCK") return (await latestStockPrices([sym.provider_symbol])).get(sym.provider_symbol) ?? null;
    const res = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(sym.provider_symbol)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const d = (await res.json()) as { price?: string };
    const p = Number(d.price);
    return p > 0 ? p : null;
  } catch {
    return null;
  }
}
