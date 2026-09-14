import { aggregateBars } from "./indicators";
import type { AssetClass, Bar, Timeframe, UniverseSymbol } from "./types";

/**
 * Free market data adapters.
 *  - Crypto: Binance public market-data mirror (no key, no geo block).
 *  - Stocks: Yahoo chart API (daily ≈ decades, 60m ≈ 730 days, 15m ≈ 60 days). 4h = aggregated 60m.
 *  - Earnings calendar: Nasdaq calendar by date.
 * Only CLOSED bars are returned — the scanner never looks at a forming candle.
 */

export const TF_MS: Record<Timeframe, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

const BINANCE = "https://data-api.binance.vision/api/v3";
const BINANCE_FUTURES = "https://fapi.binance.com/fapi/v1";
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = { "User-Agent": "Mozilla/5.0 (MySelf trading)", Accept: "application/json" };

async function getJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: UA, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function onlyClosed(bars: Bar[], tfMs: number, now: number) {
  return bars.filter((b) => b.t + tfMs <= now);
}

async function binanceKlines(providerSymbol: string, tf: Timeframe, sinceMs: number, now: number): Promise<Bar[]> {
  const out: Bar[] = [];
  let start = sinceMs;
  for (let page = 0; page < 40 && start < now; page++) {
    const url = `${BINANCE}/klines?symbol=${encodeURIComponent(providerSymbol)}&interval=${tf}&startTime=${start}&limit=1000`;
    const rows = (await getJson(url)) as unknown[][];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      out.push({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) });
    }
    const last = Number(rows[rows.length - 1][0]);
    if (rows.length < 1000) break;
    start = last + TF_MS[tf];
  }
  return onlyClosed(out, TF_MS[tf], now);
}

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
    error?: unknown;
  };
};

async function yahooBars(providerSymbol: string, interval: "15m" | "60m" | "1d", range: string): Promise<Bar[]> {
  const url = `${YAHOO}/${encodeURIComponent(providerSymbol)}?interval=${interval}&range=${range}&includePrePost=false`;
  const data = (await getJson(url)) as YahooChart;
  const res = data.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0];
  if (!q) throw new Error("yahoo_no_data");
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    let t = ts[i] * 1000;
    // Normalise daily bars to 00:00 UTC so "closed" = next UTC midnight (after the US close).
    if (interval === "1d") t = Math.floor(t / 86_400_000) * 86_400_000;
    bars.push({ t, o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  return bars;
}

function yahooRangeFor(days: number, max: number) {
  const d = Math.min(days, max);
  return d > 365 ? `${Math.ceil(d / 365)}y` : `${d}d`;
}

/** Fetch closed bars for a symbol since `sinceMs`. */
export async function fetchBars(sym: UniverseSymbol, tf: Timeframe, sinceMs: number, now = Date.now()): Promise<Bar[]> {
  if (sym.asset_class !== "STOCK") return binanceKlines(sym.provider_symbol, tf, sinceMs, now);
  const days = Math.ceil((now - sinceMs) / 86_400_000) + 2;
  if (tf === "1d") {
    const bars = await yahooBars(sym.provider_symbol, "1d", yahooRangeFor(days, 3650));
    return onlyClosed(bars.filter((b) => b.t >= sinceMs - 86_400_000), TF_MS["1d"], now);
  }
  if (tf === "5m") throw new Error("stock_5m_unsupported");
  if (tf === "15m") {
    const bars = await yahooBars(sym.provider_symbol, "15m", `${Math.min(days, 59)}d`);
    return onlyClosed(bars.filter((b) => b.t >= sinceMs), TF_MS["15m"], now);
  }
  const hourly = await yahooBars(sym.provider_symbol, "60m", `${Math.min(days, 729)}d`);
  const filtered = onlyClosed(hourly.filter((b) => b.t >= sinceMs), TF_MS["1h"], now);
  if (tf === "1h") return filtered;
  // US hourly bars start at :30, so a 4h UTC bucket is only complete 30 minutes after its nominal end.
  return aggregateBars(filtered, TF_MS["4h"]).filter((b) => b.t + TF_MS["4h"] + 30 * 60_000 <= now);
}

/** Per-request memo so one tick never fetches the same series twice. */
export function createBarCache(now = Date.now()) {
  const memo = new Map<string, Promise<Bar[]>>();
  return {
    now,
    get(sym: UniverseSymbol, tf: Timeframe, lookbackBars: number): Promise<Bar[]> {
      const key = `${sym.provider_symbol}|${tf}|${lookbackBars}`;
      let p = memo.get(key);
      if (!p) {
        p = fetchBars(sym, tf, now - lookbackBars * TF_MS[tf] * (sym.asset_class === "STOCK" && tf !== "1d" ? 4 : 1), now);
        memo.set(key, p);
      }
      return p;
    },
  };
}
export type BarCache = ReturnType<typeof createBarCache>;

/** Latest perp funding rate; null when unavailable. */
export async function fetchFundingRate(providerSymbol: string): Promise<number | null> {
  try {
    const data = (await getJson(`${BINANCE_FUTURES}/premiumIndex?symbol=${encodeURIComponent(providerSymbol)}`, 8000)) as { lastFundingRate?: string };
    const v = Number(data.lastFundingRate);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export async function fetchBidAskSpreadPct(providerSymbol: string): Promise<number | null> {
  try {
    const d = (await getJson(`${BINANCE}/ticker/bookTicker?symbol=${encodeURIComponent(providerSymbol)}`, 8000)) as { bidPrice?: string; askPrice?: string };
    const bid = Number(d.bidPrice);
    const ask = Number(d.askPrice);
    if (!(bid > 0) || !(ask >= bid)) return null;
    return (ask - bid) / ((ask + bid) / 2);
  } catch {
    return null;
  }
}

/** Symbols reporting earnings on the given US dates. Returns null if any date fails (fail closed). */
export async function fetchEarningsSymbols(dates: string[]): Promise<Set<string> | null> {
  try {
    const all = await Promise.all(
      dates.map(async (date) => {
        const d = (await getJson(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, 10_000)) as {
          data?: { rows?: Array<{ symbol?: string }> | null };
        };
        if (!d.data) throw new Error("nasdaq_no_data");
        return (d.data.rows ?? []).map((r) => String(r.symbol ?? "").toUpperCase()).filter(Boolean);
      })
    );
    return new Set(all.flat());
  } catch {
    return null;
  }
}

export type MarketContext = {
  vix: number | null;
  btc_dominance_pct: number | null;
  spy_above_ma200: boolean | null;
  btc_above_ma200: boolean | null;
};

export async function fetchVix(): Promise<number | null> {
  try {
    const bars = await yahooBars("^VIX", "1d", "5d");
    return bars.at(-1)?.c ?? null;
  } catch {
    return null;
  }
}

export async function fetchBtcDominance(): Promise<number | null> {
  try {
    const d = (await getJson("https://api.coingecko.com/api/v3/global", 8000)) as { data?: { market_cap_percentage?: { btc?: number } } };
    return d.data?.market_cap_percentage?.btc ?? null;
  } catch {
    return null;
  }
}

export function lookbackForClass(assetClass: AssetClass, tf: Timeframe) {
  // Enough bars for EMA200 on the trend frame plus warm-up on the entry frame.
  // Stocks: ~420 trading days ≈ 610 calendar days (daily EMA200 + 400-bar level lookback).
  if (tf === "1d") return assetClass === "STOCK" ? 610 : 420;
  // Strategy v2 builds 4h from hourly: EMA200 on 4h + 300-bar level lookback.
  if (tf === "1h") return 1500;
  if (assetClass === "STOCK" && tf === "4h") return 320;
  return 300;
}
