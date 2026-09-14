import { MODE_TIMEFRAMES, REGIME_REFERENCE, SEED_UNIVERSE, type StrategyParams } from "./config";
import { BACKTEST_VARIANTS, runBacktest, type BacktestResult, type BacktestSymbolData, type BacktestVariant } from "./backtest";
import { TF_MS, fetchBars } from "./market-data";
import type { AssetClass, Bar, TradingMode, UniverseSymbol } from "./types";
import type { CalendarEvent } from "./veto";

/** Loads real history and runs every backtest variant over the same data. */

export type BacktestRequest = {
  symbols: UniverseSymbol[];
  mode: TradingMode;
  years: number;
  params: StrategyParams;
  starting_equity: number;
  calendar?: CalendarEvent[];
  variants?: BacktestVariant[];
};

export type LoadedHistory = {
  symbols: BacktestSymbolData[];
  market: Partial<Record<AssetClass, Bar[]>>;
  start: number;
  end: number;
  skipped: { symbol: string; reason: string }[];
};

const WARMUP_DAYS = 320;

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export async function loadHistory(req: Pick<BacktestRequest, "symbols" | "mode" | "years">, now = Date.now()): Promise<LoadedHistory> {
  const tfs = MODE_TIMEFRAMES[req.mode];
  const start = now - req.years * 365 * 86_400_000;
  const since = start - WARMUP_DAYS * 86_400_000;
  const skipped: LoadedHistory["skipped"] = [];

  const loaded = await mapLimit(req.symbols, 4, async (sym) => {
    try {
      const [entry, daily] = await Promise.all([fetchBars(sym, tfs.entry, since, now), fetchBars(sym, "1d", since, now)]);
      const trend = tfs.trend === "1d" ? daily : await fetchBars(sym, tfs.trend, since, now);
      if (entry.length < 300 || daily.length < 250) {
        skipped.push({ symbol: sym.symbol, reason: `insufficient_history(${entry.length}/${daily.length})` });
        return null;
      }
      return { symbol: sym.symbol, asset_class: sym.asset_class, entry, entryMs: TF_MS[tfs.entry], trend, trendMs: TF_MS[tfs.trend], daily } satisfies BacktestSymbolData;
    } catch (err) {
      skipped.push({ symbol: sym.symbol, reason: err instanceof Error ? err.message : "fetch_failed" });
      return null;
    }
  });
  const symbols = loaded.filter((x): x is BacktestSymbolData => x !== null);

  const market: Partial<Record<AssetClass, Bar[]>> = {};
  const needStock = symbols.some((s) => s.asset_class === "STOCK");
  const needCrypto = symbols.some((s) => s.asset_class !== "STOCK");
  const fromLoaded = (ref: UniverseSymbol) => symbols.find((s) => s.symbol === ref.symbol)?.daily;
  if (needStock) market.STOCK = fromLoaded(REGIME_REFERENCE.STOCK) ?? (await fetchBars(REGIME_REFERENCE.STOCK, "1d", since, now));
  if (needCrypto) {
    const btc = fromLoaded(REGIME_REFERENCE.CRYPTO_ALT) ?? (await fetchBars(REGIME_REFERENCE.CRYPTO_ALT, "1d", since, now));
    market.CRYPTO_ALT = btc;
    market.CRYPTO_MAJOR = btc;
  }

  // Stocks have shorter intraday history on the free feed — start where every series has warmed up.
  const earliestEntry = Math.max(start, ...symbols.map((s) => s.entry[Math.min(s.entry.length - 1, 250)].t));
  return { symbols, market, start: Math.min(earliestEntry, now - 90 * 86_400_000), end: now, skipped };
}

export async function runBacktestSuite(req: BacktestRequest, now = Date.now()) {
  const history = await loadHistory(req, now);
  const variants = req.variants ?? BACKTEST_VARIANTS;
  const results: BacktestResult[] = variants.map((variant) =>
    runBacktest({
      symbols: history.symbols,
      market: history.market,
      params: req.params,
      variant,
      starting_equity: req.starting_equity,
      start: history.start,
      end: history.end,
      calendar: req.calendar,
    })
  );
  return { history, results };
}

export function symbolsFromIds(ids: string[] | undefined): UniverseSymbol[] {
  if (!ids?.length) return SEED_UNIVERSE;
  const set = new Set(ids.map((s) => s.toUpperCase()));
  return SEED_UNIVERSE.filter((s) => set.has(s.symbol));
}
