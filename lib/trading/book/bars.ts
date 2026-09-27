import { getSupabase } from "@/lib/supabase";
import { mapWithConcurrency } from "@/lib/concurrency";
import { stockBars } from "../broker/alpaca-data";
import { fetchBars } from "../market-data";
import type { Bar, UniverseSymbol } from "../types";

/**
 * Daily bars for the book. Stocks/ETFs: split-adjusted SIP bars kept in myself.trading_daily_bars and
 * appended one bar a day (≈2,000 symbols × a year is too much to pull on every pass). Crypto: fetched
 * whole from Binance each pass (a few dozen symbols, one request each).
 */

export const D1 = 86_400_000;
/** SMA200 + a 100-day breakout + indicator warm-up ≈ 290 sessions ≈ 430 calendar days. */
export const BOOK_HISTORY_DAYS = 430;
/** A stored close that moved this much when re-read means a split re-based the history. */
export const SPLIT_TOLERANCE = 0.005;
/** How far back the incremental sync re-reads (to catch splits and late corrections). */
const RECHECK_DAYS = 12;
/** PostgREST caps RPC rows at 1000; batch symbols so each call stays under that limit. */
export const BOOK_LAST_BARS_SYMBOL_BATCH = 500;

export const dayIso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** UTC midnight of the bar's date — the research convention (Yahoo daily bars are normalised the same way). */
export const utcDay = (t: number) => Math.floor(t / D1) * D1;

export type LastBar = { t: string; c: number };

/** Which symbols need a full load and which only the recent days. */
export function planBarSync(universe: string[], last: Map<string, LastBar>): { backfill: string[]; incremental: string[] } {
  const backfill: string[] = [];
  const incremental: string[] = [];
  for (const s of universe) (last.has(s) ? incremental : backfill).push(s);
  return { backfill, incremental };
}

/** Symbols whose re-read bars disagree with what we stored — their history was re-based (split, correction). */
export function detectRebased(stored: Map<string, Map<string, number>>, fresh: Map<string, Bar[]>): string[] {
  const out: string[] = [];
  for (const [symbol, bars] of fresh) {
    const old = stored.get(symbol);
    if (!old) continue;
    for (const b of bars) {
      const prev = old.get(dayIso(utcDay(b.t)));
      if (prev !== undefined && Math.abs(b.c / prev - 1) > SPLIT_TOLERANCE) {
        out.push(symbol);
        break;
      }
    }
  }
  return out;
}

const toRows = (symbol: string, bars: Bar[]) => bars.map((b) => ({ symbol, t: dayIso(utcDay(b.t)), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

async function upsertRows(rows: ReturnType<typeof toRows>) {
  const sb = getSupabase();
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from("trading_daily_bars").upsert(rows.slice(i, i + 1000), { onConflict: "symbol,t" });
    if (error) throw new Error(`daily bars upsert: ${error.message}`);
  }
}

async function lastStoredBars(symbols: string[]): Promise<Map<string, LastBar>> {
  const out = new Map<string, LastBar>();
  for (let i = 0; i < symbols.length; i += BOOK_LAST_BARS_SYMBOL_BATCH) {
    const batch = symbols.slice(i, i + BOOK_LAST_BARS_SYMBOL_BATCH);
    const { data, error } = await getSupabase().rpc("book_last_bars", { p_symbols: batch });
    if (error) throw new Error(`book_last_bars: ${error.message}`);
    for (const r of (data ?? []) as { symbol: string; t: string; c: number }[]) {
      out.set(r.symbol, { t: r.t, c: Number(r.c) });
    }
  }
  return out;
}

async function storedCloses(symbols: string[], sinceIso: string): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  for (let i = 0; i < symbols.length; i += 200) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await getSupabase().from("trading_daily_bars").select("symbol, t, c").in("symbol", symbols.slice(i, i + 200)).gte("t", sinceIso).range(from, from + 999);
      if (error) throw new Error(`stored closes: ${error.message}`);
      const rows = (data ?? []) as { symbol: string; t: string; c: number }[];
      for (const r of rows) {
        let m = out.get(r.symbol);
        if (!m) out.set(r.symbol, (m = new Map()));
        m.set(r.t, Number(r.c));
      }
      if (rows.length < 1000) break;
    }
  }
  return out;
}

export type BarSyncResult = { appended: number; backfilled: number; rebased: string[]; remaining: number };

/**
 * Bring the store up to date for `symbols`: append the recent days for every symbol already stored
 * (re-loading any whose history was re-based), then backfill new symbols within the time budget —
 * the first full load of ~2,000 names spreads over a few ticks.
 */
export async function syncStockBars(input: { symbols: string[]; now: number; deadline: number }): Promise<BarSyncResult> {
  const { now } = input;
  const last = await lastStoredBars(input.symbols);
  const plan = planBarSync(input.symbols, last);
  const endMs = now - 16 * 60_000; // SIP bars are free once 15 minutes old
  const res: BarSyncResult = { appended: 0, backfilled: 0, rebased: [], remaining: 0 };

  const today = dayIso(utcDay(now));
  const stale = plan.incremental.filter((s) => (last.get(s)?.t ?? "") < today);
  if (stale.length) {
    const since = now - RECHECK_DAYS * D1;
    const fresh = new Map<string, Bar[]>();
    const batches: string[][] = [];
    for (let i = 0; i < stale.length; i += 200) batches.push(stale.slice(i, i + 200));
    await mapWithConcurrency(batches, 4, async (batch) => {
      for (const [s, b] of await stockBars(batch, "1Day", since, { endMs, feed: "sip" })) fresh.set(s, b);
    });
    res.rebased = detectRebased(await storedCloses([...fresh.keys()], dayIso(utcDay(since))), fresh);
    const rebased = new Set(res.rebased);
    if (rebased.size) await getSupabase().from("trading_daily_bars").delete().in("symbol", [...rebased]);
    const rows = [...fresh].filter(([s]) => !rebased.has(s)).flatMap(([s, b]) => toRows(s, b));
    await upsertRows(rows);
    res.appended = rows.length;
    plan.backfill.unshift(...rebased);
  }

  const queue = [...plan.backfill];
  const batches: string[][] = [];
  for (let i = 0; i < queue.length; i += 20) batches.push(queue.slice(i, i + 20));
  let done = 0;
  await mapWithConcurrency(batches, 3, async (batch) => {
    if (Date.now() > input.deadline) return;
    const bars = await stockBars(batch, "1Day", now - BOOK_HISTORY_DAYS * D1, { endMs, feed: "sip" });
    await upsertRows([...bars].flatMap(([s, b]) => toRows(s, b)));
    done += batch.length;
  });
  res.backfilled = done;
  res.remaining = queue.length - done;
  return res;
}

/** A year of stored daily bars per symbol, bar times at UTC midnight (ascending). */
export async function loadStockSeries(symbols: string[], sinceMs: number): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  const since = dayIso(utcDay(sinceMs));
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 250) batches.push(symbols.slice(i, i + 250));
  await mapWithConcurrency(batches, 4, async (batch) => {
    const { data, error } = await getSupabase().rpc("book_series", { p_symbols: batch, p_since: since });
    if (error) throw new Error(`book_series: ${error.message}`);
    for (const r of (data ?? []) as { symbol: string; t: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }[]) {
      out.set(
        r.symbol,
        r.t.map((d, k) => ({ t: Date.parse(`${d}T00:00:00Z`), o: Number(r.o[k]), h: Number(r.h[k]), l: Number(r.l[k]), c: Number(r.c[k]), v: Number(r.v[k]) }))
      );
    }
  });
  return out;
}

/** Closed Binance daily bars for crypto (UTC days). */
export async function loadCryptoSeries(symbols: UniverseSymbol[], now: number): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  await mapWithConcurrency(symbols, 6, async (s) => {
    try {
      const bars = await fetchBars(s, "1d", now - BOOK_HISTORY_DAYS * D1, now);
      if (bars.length) out.set(s.symbol, bars);
    } catch {
      /* a coin without data is simply not scanned today */
    }
  });
  return out;
}
