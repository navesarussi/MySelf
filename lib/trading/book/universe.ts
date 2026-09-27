import { getSupabase } from "@/lib/supabase";
import type { AssetClass, Bar } from "../types";

/**
 * The book's universe: every liquid asset the Alpaca demo account can trade — all US stocks and ETFs with
 * price ≥ $10 and ≥ $20M a day, and every Alpaca crypto pair with a liquid Binance market (signals use
 * Binance bars, orders go to Alpaca). Rebuilt once a day by the intraday tick's universe refresh, from the
 * same daily bars it already pulls (lib/trading/intraday-universe.ts).
 */

export type BookGroup = "STOCKS" | "ETF" | "CRYPTO";

export type BookUniverseRow = {
  symbol: string;
  asset_class: AssetClass;
  grp: BookGroup;
  provider_symbol: string;
  name: string | null;
  dollar_volume: number;
  price: number | null;
  enabled: boolean;
};

export const BOOK_UNIVERSE_RULES = Object.freeze({
  STOCK_MIN_PRICE: 10,
  /** 20-day average; a $20K position is < 0.1% of a day's volume. */
  STOCK_MIN_DOLLAR_VOLUME: 20_000_000,
  CRYPTO_MIN_QUOTE_VOLUME: 5_000_000,
});

/** Exchange-traded funds/notes by issuer name — Alpaca's asset list has no ETF flag. REIT "…Trust" stocks stay stocks. */
const ETF_NAME = /\bETF\b|\bETN\b|\bETP\b|ProShares|iShares|Direxion|\bSPDR\b|Invesco QQQ|VanEck|Vanguard|GraniteShares|Leveraged|Daily .*(Bull|Bear)|\bIndex Fund\b|\bUltra(Pro|Short)\b/i;

export function isEtfName(name: string | null | undefined): boolean {
  return Boolean(name && ETF_NAME.test(name));
}

/** Liquid stocks and ETFs from 20+ recent daily bars. */
export function selectBookStocks(daily: Map<string, Bar[]>, names: Map<string, string | undefined>): BookUniverseRow[] {
  const R = BOOK_UNIVERSE_RULES;
  const rows: BookUniverseRow[] = [];
  for (const [symbol, bars] of daily) {
    if (bars.length < 15) continue;
    const last = bars.slice(-20);
    const dollarVolume = last.reduce((s, b) => s + b.c * b.v, 0) / last.length;
    const price = bars[bars.length - 1].c;
    if (!(price >= R.STOCK_MIN_PRICE) || !(dollarVolume >= R.STOCK_MIN_DOLLAR_VOLUME)) continue;
    const name = names.get(symbol) ?? null;
    rows.push({ symbol, asset_class: "STOCK", grp: isEtfName(name) ? "ETF" : "STOCKS", provider_symbol: symbol, name, dollar_volume: dollarVolume, price, enabled: true });
  }
  return rows.sort((a, b) => b.dollar_volume - a.dollar_volume);
}

/** Crypto the demo account can trade, with a liquid Binance USDT market for the signal bars. */
export function selectBookCrypto(tickers: { symbol: string; quoteVolume: string | number; lastPrice: string | number }[], alpacaBases: Set<string>): BookUniverseRow[] {
  const rows: BookUniverseRow[] = [];
  for (const t of tickers) {
    if (!t.symbol.endsWith("USDT")) continue;
    const base = t.symbol.slice(0, -4);
    if (!alpacaBases.has(base)) continue;
    const vol = Number(t.quoteVolume);
    const price = Number(t.lastPrice);
    if (!(vol >= BOOK_UNIVERSE_RULES.CRYPTO_MIN_QUOTE_VOLUME) || !(price > 0)) continue;
    rows.push({ symbol: base, asset_class: base === "BTC" || base === "ETH" ? "CRYPTO_MAJOR" : "CRYPTO_ALT", grp: "CRYPTO", provider_symbol: t.symbol, name: null, dollar_volume: vol, price, enabled: true });
  }
  return rows.sort((a, b) => b.dollar_volume - a.dollar_volume);
}

/**
 * Replace the universe with a fresh build. A symbol the user switched off stays off; one that fell out of
 * the liquidity screen is removed (open positions are managed from the trade row, not the universe).
 */
export async function saveBookUniverse(rows: BookUniverseRow[], now: number) {
  if (!rows.length) return;
  // Alpaca can list a symbol twice (e.g. a class-share alias); one upsert chunk must not touch a row twice.
  rows = [...new Map(rows.map((r) => [r.symbol, r])).values()];
  const sb = getSupabase();
  const { data: off } = await sb.from("trading_book_universe").select("symbol").eq("enabled", false);
  const disabled = new Set(((off ?? []) as { symbol: string }[]).map((r) => r.symbol));
  const refreshedAt = new Date(now).toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, enabled: !disabled.has(r.symbol), refreshed_at: refreshedAt }));
    const { error } = await sb.from("trading_book_universe").upsert(chunk, { onConflict: "symbol" });
    if (error) throw new Error(`book universe upsert: ${error.message}`);
  }
  await sb.from("trading_book_universe").delete().lt("refreshed_at", refreshedAt);
}

export async function getBookUniverse(opts: { enabledOnly?: boolean } = {}): Promise<BookUniverseRow[]> {
  const out: BookUniverseRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = getSupabase().from("trading_book_universe").select("symbol, asset_class, grp, provider_symbol, name, dollar_volume, price, enabled").order("dollar_volume", { ascending: false }).range(from, from + 999);
    if (opts.enabledOnly) q = q.eq("enabled", true);
    const { data, error } = await q;
    if (error) throw new Error(`book universe: ${error.message}`);
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, dollar_volume: Number(r.dollar_volume), price: r.price === null ? null : Number(r.price) })) as BookUniverseRow[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
