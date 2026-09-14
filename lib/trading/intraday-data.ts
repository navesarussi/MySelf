import { isRegularSessionBar, latestStockPrices, stockBars } from "./broker/alpaca-data";
import { isAlpacaConfigured } from "./broker/alpaca";
import { fetchBars } from "./market-data";
import { M15, M5, buildIntradayFrames, type IntradayFrames } from "./strategy/intraday";
import type { AssetClass, Bar } from "./types";

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

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

const closedOnly = (bars: Bar[], ms: number, now: number) => bars.filter((b) => b.t + ms <= now);

export async function loadIntradayFrames(symbols: IntradaySymbol[], now: number, errors: string[]): Promise<Map<string, LoadedFrames>> {
  const out = new Map<string, LoadedFrames>();
  const crypto = symbols.filter((s) => s.asset_class !== "STOCK");
  const stocks = symbols.filter((s) => s.asset_class === "STOCK");

  await pool(crypto, 8, async (sym) => {
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
    const batches: string[][] = [];
    for (let i = 0; i < names.length; i += 100) batches.push(names.slice(i, i + 100));
    const m15 = new Map<string, Bar[]>();
    const m5 = new Map<string, Bar[]>();
    await pool(batches, 3, async (batch) => {
      try {
        // ~26 regular-session 15m bars/day → 400 bars ≈ 16 sessions ≈ 24 calendar days (+ holidays margin).
        const [a, b] = await Promise.all([stockBars(batch, "15Min", now - 30 * 86_400_000, { feed: "iex" }), stockBars(batch, "5Min", now - 8 * 86_400_000, { feed: "iex" })]);
        for (const [s, bars] of a) m15.set(s, bars);
        for (const [s, bars] of b) m5.set(s, bars);
      } catch (err) {
        errors.push(`stock bars: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
      }
    });
    for (const sym of stocks) {
      const b15 = closedOnly((m15.get(sym.provider_symbol) ?? []).filter((b) => isRegularSessionBar(b.t)), M15, now).slice(-BARS_15M);
      const b5 = closedOnly((m5.get(sym.provider_symbol) ?? []).filter((b) => isRegularSessionBar(b.t)), M5, now).slice(-BARS_5M);
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
