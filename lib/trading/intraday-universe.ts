import { getSupabase } from "@/lib/supabase";
import { atr } from "./indicators";
import { alpacaCryptoBases, listedStockAssets, stockBars } from "./broker/alpaca-data";
import { isAlpacaConfigured } from "./broker/alpaca";
import { SEED_UNIVERSE } from "./config";
import type { AssetClass, Bar } from "./types";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * Intraday universe — rebuilt once a day from liquidity, not a hand-picked list:
 *  - Crypto: every Binance USDT pair with ≥ $10M 24h volume (no stablecoins, gold tokens or tokenized stocks).
 *  - Stocks/ETFs: listed, tradable at Alpaca, price ≥ $5, 20-day avg dollar volume ≥ $50M, daily ATR ≥ 1.5%;
 *    top 150 by dollar volume (a larger list doesn't fit a 5-minute serverless tick).
 */

export const INTRADAY_UNIVERSE_RULES = Object.freeze({
  CRYPTO_MIN_QUOTE_VOLUME: 10_000_000,
  STOCK_MIN_DOLLAR_VOLUME: 50_000_000,
  STOCK_MIN_PRICE: 5,
  STOCK_MIN_ATR_PCT: 0.015,
  STOCK_MAX_SYMBOLS: 150,
  STOCK_REFERENCE: "SPY",
});

export type IntradayUniverseRow = {
  symbol: string;
  asset_class: AssetClass;
  provider_symbol: string;
  dollar_volume: number;
  atr_pct: number | null;
  price: number;
  broker_tradable: boolean;
  rank: number;
};

const NON_ASSETS = new Set(["USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "USD1", "XUSD", "EUR", "EURI", "AEUR", "BFUSD", "RLUSD", "USDE", "USDG", "USDS", "PAXG", "XAUT", "TRY", "BRL", "GBP", "JPY", "USDT"]);

export function selectCryptoUniverse(
  tickers: { symbol: string; quoteVolume: string | number; lastPrice: string | number }[],
  opts: { stockSymbols: Set<string>; alpacaBases: Set<string>; minQuoteVolume?: number }
): IntradayUniverseRow[] {
  const min = opts.minQuoteVolume ?? INTRADAY_UNIVERSE_RULES.CRYPTO_MIN_QUOTE_VOLUME;
  const rows: IntradayUniverseRow[] = [];
  for (const t of tickers) {
    if (!t.symbol.endsWith("USDT")) continue;
    const base = t.symbol.slice(0, -4);
    if (!/^[A-Z0-9]{2,12}$/.test(base) || NON_ASSETS.has(base)) continue;
    // Binance tokenized equities look like "<TICKER>B" (e.g. SOXLB) — not crypto.
    if (base.endsWith("B") && opts.stockSymbols.has(base.slice(0, -1))) continue;
    const vol = Number(t.quoteVolume);
    const price = Number(t.lastPrice);
    if (!(vol >= min) || !(price > 0)) continue;
    rows.push({ symbol: base, asset_class: base === "BTC" || base === "ETH" ? "CRYPTO_MAJOR" : "CRYPTO_ALT", provider_symbol: t.symbol, dollar_volume: vol, atr_pct: null, price, broker_tradable: opts.alpacaBases.has(base), rank: 0 });
  }
  rows.sort((a, b) => b.dollar_volume - a.dollar_volume);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function selectStockUniverse(daily: Map<string, Bar[]>, opts: { exclude?: Set<string>; max?: number } = {}): IntradayUniverseRow[] {
  const R = INTRADAY_UNIVERSE_RULES;
  const rows: IntradayUniverseRow[] = [];
  for (const [symbol, bars] of daily) {
    if (bars.length < 15 || opts.exclude?.has(symbol)) continue;
    const last = bars.slice(-20);
    const dollarVolume = last.reduce((s, b) => s + b.c * b.v, 0) / last.length;
    const price = bars[bars.length - 1].c;
    const a = atr(bars, 14);
    const atrPct = a[a.length - 1] / price;
    const isReference = symbol === R.STOCK_REFERENCE;
    if (!isReference && (price < R.STOCK_MIN_PRICE || dollarVolume < R.STOCK_MIN_DOLLAR_VOLUME || !(atrPct >= R.STOCK_MIN_ATR_PCT))) continue;
    rows.push({ symbol, asset_class: "STOCK", provider_symbol: symbol, dollar_volume: dollarVolume, atr_pct: Number.isFinite(atrPct) ? atrPct : null, price, broker_tradable: true, rank: 0 });
  }
  rows.sort((a, b) => b.dollar_volume - a.dollar_volume);
  const ref = rows.find((r) => r.symbol === R.STOCK_REFERENCE);
  const picked = rows.filter((r) => r.symbol !== R.STOCK_REFERENCE).slice(0, opts.max ?? R.STOCK_MAX_SYMBOLS);
  // The regime/context reference is always loaded (as context), even when it misses the volatility screen.
  const out = ref ? [...picked, ref] : picked;
  out.forEach((r, i) => (r.rank = i + 1));
  return out;
}

/** Rebuild myself.trading_intraday_universe. Returns counts; errors are thrown for the caller to log. */
export async function refreshIntradayUniverse(now = Date.now()): Promise<{ crypto: number; stocks: number }> {
  const tickers = (await (await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", { cache: "no-store", signal: AbortSignal.timeout(20_000) })).json()) as { symbol: string; quoteVolume: string; lastPrice: string }[];
  let stockRows: IntradayUniverseRow[] = [];
  let stockSymbols = new Set<string>();
  let alpacaBases = new Set<string>();
  if (isAlpacaConfigured()) {
    const [assets, bases] = await Promise.all([listedStockAssets(), alpacaCryptoBases().catch(() => new Set<string>())]);
    alpacaBases = bases;
    stockSymbols = new Set(assets.map((a) => a.symbol));
    // Liquid names are virtually always fractionable + marginable + easy to borrow — a cheap prefilter before fetching bars.
    const candidates = assets.filter((a) => a.fractionable && a.marginable && a.easy_to_borrow).map((a) => a.symbol);
    const batches: string[][] = [];
    for (let i = 0; i < candidates.length; i += 200) batches.push(candidates.slice(i, i + 200));
    const daily = new Map<string, Bar[]>();
    await mapWithConcurrency(batches, 6, async (batch) => {
      const res = await stockBars(batch, "1Day", now - 40 * 86_400_000, { endMs: now - 16 * 60_000, feed: "sip" });
      for (const [s, b] of res) daily.set(s, b);
    });
    stockRows = selectStockUniverse(daily);
  }
  const cryptoRows = selectCryptoUniverse(tickers, { stockSymbols, alpacaBases });
  // One namespace per symbol: a stock wins a ticker collision (crypto bases are rarely real stock tickers we trade).
  const stockSet = new Set(stockRows.map((r) => r.symbol));
  const rows = [...cryptoRows.filter((r) => !stockSet.has(r.symbol)), ...stockRows];

  const sb = getSupabase();
  const refreshedAt = new Date(now).toISOString();
  const { error } = await sb.from("trading_intraday_universe").upsert(rows.map((r) => ({ ...r, refreshed_at: refreshedAt })), { onConflict: "symbol" });
  if (error) throw new Error(`intraday universe upsert: ${error.message}`);
  await sb.from("trading_intraday_universe").delete().lt("refreshed_at", refreshedAt);
  return { crypto: cryptoRows.length, stocks: stockRows.length };
}

/** Current intraday universe; falls back to the seeded crypto list when the table hasn't been built yet. */
export async function getIntradayUniverse(): Promise<IntradayUniverseRow[]> {
  const { data, error } = await getSupabase().from("trading_intraday_universe").select("symbol, asset_class, provider_symbol, dollar_volume, atr_pct, price, broker_tradable, rank").order("rank");
  if (error) throw new Error(`intraday universe: ${error.message}`);
  const rows = (data ?? []).map((r) => ({ ...r, dollar_volume: Number(r.dollar_volume), atr_pct: r.atr_pct === null ? null : Number(r.atr_pct), price: Number(r.price) })) as IntradayUniverseRow[];
  if (rows.length) return rows;
  return SEED_UNIVERSE.filter((s) => s.asset_class !== "STOCK").map((s, i) => ({ ...s, dollar_volume: 0, atr_pct: null, price: 0, broker_tradable: false, rank: i + 1 }));
}

/** Provider symbol for a symbol that may have left the universe but still has an open position. */
export function providerSymbolFor(symbol: string, assetClass: AssetClass) {
  return assetClass === "STOCK" ? symbol : `${symbol}USDT`;
}
