import { REGIME_REFERENCE } from "../config";
import { aggregateBars } from "../indicators";
import { fetchBars } from "../market-data";
import type { AssetClass, Bar, UniverseSymbol } from "../types";
import type { SymbolFrames } from "./candidates";
import { buildTfSeries } from "./series";

const H1 = 3_600_000;
const H4 = 4 * H1;
const D1 = 24 * H1;

/**
 * US equities print hourly bars at :30. Shift them +30 min so every bar's close lands on the hour
 * grid; this only ever makes data arrive later than reality (never look-ahead).
 */
export function alignStockHourly(bars: Bar[]): Bar[] {
  // Yahoo occasionally emits an extra on-the-hour print (e.g. the 16:00 ET close); only regular :30 session bars are kept.
  return bars.filter((b) => b.t % H1 === 30 * 60_000).map((b) => ({ ...b, t: b.t + 30 * 60_000 }));
}

export function framesFromBars(sym: UniverseSymbol, hourly: Bar[], daily: Bar[]): SymbolFrames {
  const h1 = sym.asset_class === "STOCK" ? alignStockHourly(hourly) : hourly;
  return {
    symbol: sym.symbol,
    asset_class: sym.asset_class,
    d1: buildTfSeries(daily, D1),
    h4: buildTfSeries(aggregateBars(h1, H4), H4),
    h1: buildTfSeries(h1, H1),
  };
}

export type BarLoader = (sym: UniverseSymbol, tf: "1h" | "1d", since: number) => Promise<Bar[]>;

export async function loadFramesV2(symbols: UniverseSymbol[], sinceMs: number, loader: BarLoader = (s, tf, since) => fetchBars(s, tf, since)) {
  const frames: SymbolFrames[] = [];
  const skipped: { symbol: string; reason: string }[] = [];
  let next = 0;
  // Bounded parallelism: hourly history is many pages per symbol.
  await Promise.all(
    Array.from({ length: Math.min(4, symbols.length) }, async () => {
      while (next < symbols.length) {
        const sym = symbols[next++];
        try {
          const [hourly, daily] = await Promise.all([loader(sym, "1h", sinceMs), loader(sym, "1d", sinceMs - 400 * D1)]);
          if (hourly.length < 2000 || daily.length < 300) {
            skipped.push({ symbol: sym.symbol, reason: `insufficient_history(${hourly.length}h/${daily.length}d)` });
            continue;
          }
          frames.push(framesFromBars(sym, hourly, daily));
        } catch (err) {
          skipped.push({ symbol: sym.symbol, reason: err instanceof Error ? err.message : "fetch_failed" });
        }
      }
    })
  );
  frames.sort((a, b) => symbols.findIndex((s) => s.symbol === a.symbol) - symbols.findIndex((s) => s.symbol === b.symbol));
  const reference: Partial<Record<AssetClass, SymbolFrames>> = {};
  const find = (s: UniverseSymbol) => frames.find((f) => f.symbol === s.symbol);
  if (frames.some((f) => f.asset_class === "STOCK")) reference.STOCK = find(REGIME_REFERENCE.STOCK);
  if (frames.some((f) => f.asset_class !== "STOCK")) {
    reference.CRYPTO_ALT = find(REGIME_REFERENCE.CRYPTO_ALT);
    reference.CRYPTO_MAJOR = reference.CRYPTO_ALT;
  }
  return { frames, reference, skipped };
}

/**
 * Backtest start: late-listed symbols simply join once warm (analystBrief returns null before), so the
 * range is not shortened to the youngest symbol. Needs ~220 daily bars on the reference.
 */
export function warmStart(frames: SymbolFrames[], min: number) {
  const warm = frames.map((f) => f.d1.bars[Math.min(f.d1.bars.length - 1, 220)].t).sort((a, b) => a - b);
  return Math.max(min, warm[0] ?? min, min + 60 * D1);
}
