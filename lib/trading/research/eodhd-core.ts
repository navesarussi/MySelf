import type { Bar } from "../types";

/**
 * EODHD (survivorship-free US daily data, phase 2 research — docs/superpowers/specs/2026-09-30-trading-phase2-edge-design.md).
 * Pure helpers; scripts/trading/data/eodhd.ts does the I/O.
 */

export type EodRow = { date: string; open: number; high: number; low: number; close: number; adjusted_close: number; volume: number };
export type SymbolRow = { Code: string; Exchange: string; Type: string };
export type ResearchSymbol = { code: string; exchange: string; delisted: boolean };

/** Listed (or once listed) on a main US exchange — OTC/pink sheets are not tradable for the book. */
export const MAIN_EXCHANGES = new Set(["NYSE", "NASDAQ", "NYSE ARCA", "NYSE MKT", "AMEX", "BATS"]);

/** OHLC scaled by adjusted_close / close: split- and dividend-adjusted (total return), in the research bar format. */
export function adjustRows(rows: EodRow[]): Bar[] {
  const out: Bar[] = [];
  for (const r of rows) {
    const close = Number(r.close);
    const adj = Number(r.adjusted_close);
    if (!(close > 0) || !(adj > 0) || !(r.open > 0) || !(r.high > 0) || !(r.low > 0)) continue;
    const f = adj / close;
    out.push({ t: Date.parse(`${r.date}T00:00:00Z`), o: r.open * f, h: r.high * f, l: r.low * f, c: adj, v: Number(r.volume) || 0 });
  }
  return out;
}

/**
 * Common stocks on the main exchanges, active and delisted. A delisted ticker that a live company uses now cannot
 * be fetched on its own (EODHD addresses by ticker) — reported as a collision and left to splitSeries.
 */
export function researchSymbols(active: SymbolRow[], delisted: SymbolRow[]): { symbols: ResearchSymbol[]; collisions: string[] } {
  const keep = (r: SymbolRow) => r.Type === "Common Stock" && MAIN_EXCHANGES.has(r.Exchange);
  const symbols: ResearchSymbol[] = [];
  const seen = new Set<string>();
  for (const r of active.filter(keep)) {
    if (seen.has(r.Code)) continue;
    seen.add(r.Code);
    symbols.push({ code: r.Code, exchange: r.Exchange, delisted: false });
  }
  const collisions: string[] = [];
  for (const r of delisted.filter(keep)) {
    if (seen.has(r.Code)) {
      if (!symbols.find((s) => s.code === r.Code)?.delisted) collisions.push(r.Code);
      continue;
    }
    seen.add(r.Code);
    symbols.push({ code: r.Code, exchange: r.Exchange, delisted: true });
  }
  return { symbols, collisions };
}

const GAP_MS = 30 * 86_400_000;

/** Split where one ticker's history is really two companies: a gap over 30 days, or a close-to-close jump beyond 5×. */
export function splitSeries(bars: Bar[]): Bar[][] {
  const parts: Bar[][] = [];
  let cur: Bar[] = [];
  for (const b of bars) {
    const prev = cur[cur.length - 1];
    if (prev && (b.t - prev.t > GAP_MS || b.c / prev.c > 5 || b.c / prev.c < 0.2)) {
      parts.push(cur);
      cur = [];
    }
    cur.push(b);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

/** Data-quality check between two sources: daily close-to-close returns on the dates both have. */
export function compareReturns(a: Bar[], b: Bar[]): { n: number; median_abs_diff: number; share_over_1pct: number } {
  const bm = new Map(b.map((x) => [x.t, x.c]));
  const diffs: number[] = [];
  for (let i = 1; i < a.length; i++) {
    const b0 = bm.get(a[i - 1].t);
    const b1 = bm.get(a[i].t);
    if (b0 === undefined || b1 === undefined || !(b0 > 0) || !(a[i - 1].c > 0)) continue;
    diffs.push(Math.abs(a[i].c / a[i - 1].c - b1 / b0));
  }
  diffs.sort((x, y) => x - y);
  return { n: diffs.length, median_abs_diff: diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0, share_over_1pct: diffs.length ? diffs.filter((d) => d > 0.01).length / diffs.length : 0 };
}
