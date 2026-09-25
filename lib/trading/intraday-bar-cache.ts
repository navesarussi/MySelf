import type { Bar } from "./types";

/**
 * Per-symbol tail of closed stock bars, kept across warm invocations of the intraday tick.
 *
 * A cold load of the stock universe is ~180 Alpaca pages (pages hold ~800 bars whatever `limit` says), which
 * is most of the data API's 200 requests/minute and ~20s of sequential paging. Warm ticks only need the bars
 * since the last one they saw. Bounded: `tail` bars per symbol, at most MAX_SYMBOLS symbols, and dropped whole
 * on a new UTC day so split adjustments (applied before the open) are re-fetched.
 *
 * The tick and the "search trade" button can load at the same time on one instance, so nothing here evicts a
 * single symbol mid-flight: a warm merge whose entry vanished (a reset in between) stores nothing, and the
 * symbol loads cold next time instead of living on as a short, gappy series.
 */

/** ~2× the intraday universe (the daily rebuild swaps members); past this the cache starts over. */
export const MAX_SYMBOLS = 600;

export type TailCache = {
  day: string;
  tail: number;
  series: Map<string, Bar[]>;
};

export function createTailCache(tail: number): TailCache {
  return { day: "", tail, series: new Map() };
}

/** Cached bars before the first fresh bar, then the fresh ones (a re-fetched bar replaces its cached copy), last `tail`. */
export function mergeTail(cached: readonly Bar[], fresh: readonly Bar[], tail: number): Bar[] {
  let cut = cached.length;
  if (fresh.length) while (cut > 0 && cached[cut - 1].t >= fresh[0].t) cut--;
  const merged = cached.slice(0, cut).concat(fresh);
  return merged.length > tail ? merged.slice(-tail) : merged;
}

export type RefreshPlan = { cold: string[]; warm: string[]; warmStart: number };

/**
 * Which symbols need their full history (`cold`) and which only need bars since `warmStart` — the oldest
 * last-cached bar minus `overlapMs`, so the newest cached bars are re-read in case they were still settling.
 * Starts the cache over on a new day or once it holds MAX_SYMBOLS symbols.
 */
export function planRefresh(cache: TailCache, symbols: readonly string[], day: string, fullStart: number, overlapMs: number): RefreshPlan {
  if (cache.day !== day || cache.series.size >= MAX_SYMBOLS) {
    cache.series.clear();
    cache.day = day;
  }
  const cold: string[] = [];
  const warm: string[] = [];
  let warmStart = Infinity;
  for (const s of symbols) {
    const last = cache.series.get(s)?.at(-1);
    const start = last ? last.t - overlapMs : -Infinity;
    if (start <= fullStart) cold.push(s);
    else {
      warm.push(s);
      warmStart = Math.min(warmStart, start);
    }
  }
  return { cold, warm, warmStart: warm.length ? warmStart : fullStart };
}

/** Fold one fetched batch into the cache. A cold batch replaces what was cached; a warm one extends it. */
export function applyFetched(cache: TailCache, fetched: ReadonlyMap<string, Bar[]>, symbols: readonly string[], cold: boolean) {
  for (const s of symbols) {
    const cached = cold ? [] : cache.series.get(s);
    if (cached) cache.series.set(s, mergeTail(cached, fetched.get(s) ?? [], cache.tail));
  }
}
