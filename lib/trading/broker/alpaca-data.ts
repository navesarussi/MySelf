import type { Bar } from "../types";
import { ALPACA_PAPER_BASE, isAlpacaConfigured } from "./alpaca";

/**
 * Alpaca market data (read-only) for US stocks — same paper keys.
 *  - Intraday 5Min/15Min bars: IEX feed (real-time on the free plan; volume is IEX-only, proportional not consolidated).
 *  - Daily bars for screening: SIP feed, requested ≥ 16 minutes in the past (allowed on the free plan).
 */

const DATA_BASE = "https://data.alpaca.markets";

function headers() {
  if (!isAlpacaConfigured()) throw new Error("alpaca_not_configured");
  return { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID!.trim(), "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY!.trim() };
}

async function getJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(url, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`alpaca_data_${res.status}:${text.slice(0, 160)}`);
  return JSON.parse(text) as T;
}

type RawBar = { t: string; o: number; h: number; l: number; c: number; v: number };

/** Multi-symbol bars, all pages. Returns bars ascending per symbol. */
export async function stockBars(symbols: string[], timeframe: "5Min" | "15Min" | "1Day", startMs: number, opts: { endMs?: number; feed: "iex" | "sip" }): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  if (!symbols.length) return out;
  let pageToken: string | null = null;
  for (let page = 0; page < 60; page++) {
    const params = new URLSearchParams({ symbols: symbols.join(","), timeframe, start: new Date(startMs).toISOString(), feed: opts.feed, limit: "10000", adjustment: "split" });
    if (opts.endMs) params.set("end", new Date(opts.endMs).toISOString());
    if (pageToken) params.set("page_token", pageToken);
    const data = await getJson<{ bars: Record<string, RawBar[]> | null; next_page_token: string | null }>(`${DATA_BASE}/v2/stocks/bars?${params}`);
    for (const [sym, bars] of Object.entries(data.bars ?? {})) {
      const list = out.get(sym) ?? [];
      for (const b of bars) list.push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
      out.set(sym, list);
    }
    pageToken = data.next_page_token;
    if (!pageToken) break;
  }
  return out;
}

export async function latestStockPrices(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!symbols.length) return out;
  const data = await getJson<{ trades: Record<string, { p: number }> }>(`${DATA_BASE}/v2/stocks/trades/latest?symbols=${encodeURIComponent(symbols.join(","))}&feed=iex`);
  for (const [s, tr] of Object.entries(data.trades ?? {})) if (tr?.p > 0) out.set(s, tr.p);
  return out;
}

export type AlpacaClock = { is_open: boolean; next_open: string; next_close: string; timestamp: string };

export function marketClock(): Promise<AlpacaClock> {
  return getJson<AlpacaClock>(`${ALPACA_PAPER_BASE}/v2/clock`, 10_000);
}

export type AlpacaAsset = { symbol: string; exchange: string; tradable: boolean; fractionable: boolean; easy_to_borrow: boolean; marginable: boolean; shortable: boolean; status: string };

/** Listed, tradable US equities/ETFs (no OTC, no share-class dots). */
export async function listedStockAssets(): Promise<AlpacaAsset[]> {
  const all = await getJson<AlpacaAsset[]>(`${ALPACA_PAPER_BASE}/v2/assets?status=active&asset_class=us_equity`, 60_000);
  return all.filter((a) => a.tradable && ["NYSE", "NASDAQ", "ARCA", "AMEX", "BATS"].includes(a.exchange) && /^[A-Z]{1,5}$/.test(a.symbol));
}

/** Base symbols of tradable Alpaca crypto USD pairs. */
export async function alpacaCryptoBases(): Promise<Set<string>> {
  const all = await getJson<{ symbol: string; tradable: boolean }[]>(`${ALPACA_PAPER_BASE}/v2/assets?status=active&asset_class=crypto`, 20_000);
  return new Set(all.filter((a) => a.tradable && a.symbol.endsWith("/USD")).map((a) => a.symbol.split("/")[0]));
}

/** US regular session (09:30–16:00 America/New_York) for a bar starting at `t`. */
export function isRegularSessionBar(t: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date(t));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const mins = hour * 60 + minute;
  return wd !== "Sat" && wd !== "Sun" && mins >= 570 && mins < 960;
}
