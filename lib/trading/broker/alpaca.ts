import type { AssetClass } from "../types";

/**
 * Alpaca adapter — PAPER ONLY. The base URL is hard-coded to the paper endpoint and there is no
 * configuration path to the live endpoint: real money stays blocked in code, not by a setting.
 * Env: ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY.
 */

export const ALPACA_PAPER_BASE = "https://paper-api.alpaca.markets";

export type AlpacaOrder = {
  id: string;
  client_order_id: string;
  symbol: string;
  status: string;
  side: "buy" | "sell";
  type: string;
  qty: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  limit_price: string | null;
  stop_price: string | null;
  order_class: string;
  legs?: AlpacaOrder[] | null;
  filled_at: string | null;
  created_at: string;
};

export type AlpacaAccount = { equity: string; cash: string; buying_power: string; non_marginable_buying_power?: string; status: string; trading_blocked: boolean; account_blocked: boolean; currency: string };
export type AlpacaPosition = { symbol: string; qty: string; avg_entry_price: string; current_price: string; unrealized_pl: string; market_value?: string };

/** One execution (FILL activity). A single order can fill in many pieces. */
export type AlpacaFillActivity = { id: string; transaction_time: string; price: string; qty: string; side: "buy" | "sell"; symbol: string; order_id: string };

/**
 * A leftover worth less than this is fee dust, not a position. Crypto fees are
 * taken in the asset, so a fully sold position still leaves ~1e-7 units behind —
 * treating that as "still held" reopened a closed PEPE trade and booked it as
 * losing its whole notional.
 */
export const DUST_NOTIONAL_USD = 1;

export function isDustPosition(p: Pick<AlpacaPosition, "qty" | "current_price" | "market_value"> | null | undefined): boolean {
  if (!p) return true;
  const qty = Number(p.qty);
  if (!(qty > 0)) return true;
  const value = Number(p.market_value);
  const notional = Number.isFinite(value) ? Math.abs(value) : qty * Number(p.current_price);
  return Number.isFinite(notional) && notional < DUST_NOTIONAL_USD;
}

export function isAlpacaConfigured() {
  return Boolean(process.env.ALPACA_API_KEY_ID?.trim() && process.env.ALPACA_API_SECRET_KEY?.trim());
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isAlpacaConfigured()) throw new Error("alpaca_not_configured");
  const res = await fetch(`${ALPACA_PAPER_BASE}${path}`, {
    method,
    headers: {
      "APCA-API-KEY-ID": process.env.ALPACA_API_KEY_ID!.trim(),
      "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET_KEY!.trim(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`alpaca_${res.status}:${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Our symbols → Alpaca symbols. Crypto trades against USD. */
export function alpacaSymbol(symbol: string, assetClass: AssetClass) {
  return assetClass === "STOCK" ? symbol : `${symbol}/USD`;
}

/** Position endpoints use the slash-less form for crypto. */
export function alpacaPositionSymbol(symbol: string, assetClass: AssetClass) {
  return assetClass === "STOCK" ? symbol : `${symbol}USD`;
}

/** Alpaca crypto positions come back as `AVAXUSD`; stocks are already our symbol. */
export function fromAlpacaPositionSymbol(symbol: string) {
  return symbol.length > 3 && symbol.endsWith("USD") && !symbol.includes("/") ? symbol.slice(0, -3) : symbol.split("/")[0];
}

/** 403 insufficient qty/balance — a working sell order is still reserving the size. */
export function isAlpacaInsufficientQty(err: unknown) {
  const m = err instanceof Error ? err.message : String(err);
  return /alpaca_403/.test(m) && /insufficient|available/i.test(m);
}

/** Tick-size rounding Alpaca accepts: stocks ≥ $1 → cents; crypto → magnitude-based. */
export function priceDecimals(price: number, assetClass: AssetClass) {
  if (assetClass === "STOCK") return price >= 1 ? 2 : 4;
  // Alpaca crypto price increment is 1e-9: sub-$1 coins (PEPE ≈ 0.0000035) need all 9 decimals, not 6.
  return price >= 1000 ? 2 : price >= 1 ? 4 : 9;
}

export function roundPrice(price: number, assetClass: AssetClass) {
  const d = priceDecimals(price, assetClass);
  return Math.round(price * 10 ** d) / 10 ** d;
}

/** Wire format: fixed decimals — never exponent notation (String(3.4e-7) === "3.4e-7" is rejected). */
export function priceStr(price: number, assetClass: AssetClass) {
  return roundPrice(price, assetClass).toFixed(priceDecimals(price, assetClass));
}

export function roundQty(qty: number, assetClass: AssetClass) {
  return assetClass === "STOCK" ? Math.floor(qty) : Math.floor(qty * 1e6) / 1e6;
}

export const alpaca = {
  account: () => call<AlpacaAccount>("GET", "/v2/account"),

  async tradableSymbols(): Promise<Set<string>> {
    const assets = await call<{ symbol: string; tradable: boolean; fractionable: boolean }[]>("GET", "/v2/assets?status=active&asset_class=crypto");
    return new Set(assets.filter((a) => a.tradable).map((a) => a.symbol));
  },

  async isStockTradable(symbol: string) {
    try {
      const a = await call<{ tradable: boolean }>("GET", `/v2/assets/${encodeURIComponent(symbol)}`);
      return a.tradable;
    } catch {
      return false;
    }
  },

  /**
   * Entry. Stocks with a real fixed target (v2): bracket (limit entry + broker-side stop + take-profit, OCO).
   * `bracket: false` (daily-trend — trail-only, no real take-profit price) or crypto (no crypto brackets on
   * Alpaca): plain limit entry; the caller places a protective stop separately once it sees the fill.
   */
  placeEntry(input: { symbol: string; assetClass: AssetClass; qty: number; limit: number; stop: number; target: number; clientId: string; bracket?: boolean; orderType?: "limit" | "market"; timeInForce?: "gtc" | "day" }) {
    const market = input.orderType === "market";
    const base = {
      symbol: alpacaSymbol(input.symbol, input.assetClass),
      qty: String(roundQty(input.qty, input.assetClass)),
      side: "buy",
      type: market ? "market" : "limit",
      time_in_force: input.timeInForce ?? "gtc",
      ...(market ? {} : { limit_price: priceStr(input.limit, input.assetClass) }),
      client_order_id: input.clientId,
    };
    if (input.assetClass === "STOCK" && input.bracket !== false) {
      return call<AlpacaOrder>("POST", "/v2/orders", {
        ...base,
        order_class: "bracket",
        take_profit: { limit_price: priceStr(input.target, "STOCK") },
        stop_loss: { stop_price: priceStr(input.stop, "STOCK") },
      });
    }
    return call<AlpacaOrder>("POST", "/v2/orders", base);
  },

  /** Broker-side protective stop for crypto (stop-limit with a 1% limit cushion so it actually fills). */
  placeCryptoStop(input: { symbol: string; qty: number; stop: number; clientId: string }) {
    return call<AlpacaOrder>("POST", "/v2/orders", {
      symbol: alpacaSymbol(input.symbol, "CRYPTO_ALT"),
      qty: String(roundQty(input.qty, "CRYPTO_ALT")),
      side: "sell",
      type: "stop_limit",
      time_in_force: "gtc",
      stop_price: priceStr(input.stop, "CRYPTO_ALT"),
      limit_price: priceStr(input.stop * 0.99, "CRYPTO_ALT"),
      client_order_id: input.clientId,
    });
  },

  /** Broker-side protective stop for a non-bracket stock entry (plain stop-market, no limit cushion needed). */
  placeStockStop(input: { symbol: string; qty: number; stop: number; clientId: string }) {
    return call<AlpacaOrder>("POST", "/v2/orders", {
      symbol: input.symbol,
      qty: String(roundQty(input.qty, "STOCK")),
      side: "sell",
      type: "stop",
      time_in_force: "gtc",
      stop_price: priceStr(input.stop, "STOCK"),
      client_order_id: input.clientId,
    });
  },

  getOrder: (id: string) => call<AlpacaOrder>("GET", `/v2/orders/${id}?nested=true`),

  /** Replace returns a NEW order id. */
  replaceOrder: (id: string, patch: { stop_price?: number; limit_price?: number }, assetClass: AssetClass) =>
    call<AlpacaOrder>("PATCH", `/v2/orders/${id}`, {
      ...(patch.stop_price !== undefined ? { stop_price: priceStr(patch.stop_price, assetClass) } : {}),
      ...(patch.limit_price !== undefined ? { limit_price: priceStr(patch.limit_price, assetClass) } : {}),
    }),

  cancelOrder: async (id: string) => {
    try {
      await call<null>("DELETE", `/v2/orders/${id}`);
    } catch (err) {
      // 422 = already filled/cancelled — nothing to cancel.
      if (!(err instanceof Error && /alpaca_(404|422)/.test(err.message))) throw err;
    }
  },

  async position(symbol: string, assetClass: AssetClass): Promise<AlpacaPosition | null> {
    try {
      return await call<AlpacaPosition>("GET", `/v2/positions/${encodeURIComponent(alpacaPositionSymbol(symbol, assetClass))}`);
    } catch (err) {
      if (err instanceof Error && /alpaca_404/.test(err.message)) return null;
      throw err;
    }
  },

  positions: () => call<AlpacaPosition[]>("GET", "/v2/positions"),

  /** Every fill between two instants, oldest first (all pages, capped). */
  async fills(input: { after: number; until?: number; maxPages?: number }): Promise<AlpacaFillActivity[]> {
    const out: AlpacaFillActivity[] = [];
    let token: string | null = null;
    for (let page = 0; page < (input.maxPages ?? 30); page++) {
      const q = new URLSearchParams({ after: new Date(input.after).toISOString(), direction: "asc", page_size: "100" });
      if (input.until !== undefined) q.set("until", new Date(input.until).toISOString());
      if (token) q.set("page_token", token);
      const rows = await call<AlpacaFillActivity[]>("GET", `/v2/account/activities/FILL?${q}`);
      out.push(...rows);
      if (rows.length < 100) return out;
      token = rows[rows.length - 1].id;
    }
    throw new Error("alpaca_fills_truncated");
  },

  allOpenOrders: () => call<AlpacaOrder[]>("GET", "/v2/orders?status=open&limit=500"),

  openOrders: (symbol: string, assetClass: AssetClass) =>
    call<AlpacaOrder[]>("GET", `/v2/orders?status=open&symbols=${encodeURIComponent(alpacaSymbol(symbol, assetClass))}&nested=true`),

  placeMarketSell: (input: { symbol: string; assetClass: AssetClass; qty: number; clientId: string }) =>
    call<AlpacaOrder>("POST", "/v2/orders", {
      symbol: alpacaSymbol(input.symbol, input.assetClass),
      qty: String(roundQty(input.qty, input.assetClass)),
      side: "sell",
      type: "market",
      time_in_force: input.assetClass === "STOCK" ? "day" : "gtc",
      client_order_id: input.clientId,
    }),

  /** Market-close the whole position. Cancel the protective orders first — they reserve the quantity. */
  closePosition: (symbol: string, assetClass: AssetClass) =>
    call<AlpacaOrder>("DELETE", `/v2/positions/${encodeURIComponent(alpacaPositionSymbol(symbol, assetClass))}`),
};

/**
 * Quantity that can actually be sold right now.
 *
 * Crypto fees are charged in the asset, so the balance left after an entry fill
 * is slightly below the filled quantity — around 0.15% on Alpaca. Sizing a
 * protective sell from the fill therefore gets rejected with
 * `insufficient balance`, the stop never gets placed, and the position runs
 * unprotected while the tick retries forever.
 *
 * Returns null when the broker reports nothing held.
 */
export function clampSellQty(
  intended: number,
  available: number,
  assetClass: AssetClass
): number | null {
  if (!Number.isFinite(available) || available <= 0) return null;
  const target = Number.isFinite(intended) && intended > 0 ? Math.min(intended, available) : available;
  // Floor, never round up — asking for one unit more than is held is exactly
  // what returns `insufficient balance`.
  const qty = roundQty(target, assetClass);
  return qty > 0 ? qty : null;
}

export async function sellableQty(
  symbol: string,
  assetClass: AssetClass,
  intended: number
): Promise<number | null> {
  const held = await alpaca.position(symbol, assetClass);
  if (isDustPosition(held)) return null;
  return clampSellQty(intended, Number(held?.qty), assetClass);
}

/** A resting protective sell (stop / stop-limit) — the thing that keeps a position safe through an outage. */
export function isProtectiveStop(o: Pick<AlpacaOrder, "side" | "type" | "status">): boolean {
  return o.side === "sell" && (o.type === "stop" || o.type === "stop_limit") && !["filled", "canceled", "expired", "rejected", "done_for_day"].includes(o.status);
}

/**
 * Make sure the position has exactly one broker-side stop, and return it.
 *
 * An existing stop on the symbol is adopted rather than duplicated: it already
 * reserves the quantity, so a second sell is rejected with `insufficient
 * balance`. That rejection used to throw before the trade row was saved, so the
 * trade sat PENDING forever while Alpaca held the position (DOT, UNI, SOL on
 * 2026-09-26) and nothing trailed its stop.
 */
export async function ensureProtectiveStop(input: {
  tradeId: string;
  symbol: string;
  assetClass: AssetClass;
  qty: number;
  stop: number;
  now: number;
}): Promise<AlpacaOrder | null> {
  const findExisting = async () => {
    const open = await alpaca.openOrders(input.symbol, input.assetClass).catch(() => [] as AlpacaOrder[]);
    const stops = open.filter(isProtectiveStop);
    return stops.find((o) => o.client_order_id?.startsWith(input.tradeId.slice(0, 18))) ?? stops[0] ?? null;
  };
  const existing = await findExisting();
  if (existing) return existing;
  const qty = await sellableQty(input.symbol, input.assetClass, input.qty);
  if (qty === null) return null;
  const clientId = `${input.tradeId.slice(0, 18)}-sl-${input.now}`;
  try {
    return input.assetClass === "STOCK"
      ? await alpaca.placeStockStop({ symbol: input.symbol, qty, stop: input.stop, clientId })
      : await alpaca.placeCryptoStop({ symbol: input.symbol, qty, stop: input.stop, clientId });
  } catch (err) {
    // Raced with a stop placed elsewhere (or a bracket leg): adopt it.
    if (isAlpacaInsufficientQty(err)) {
      const raced = await findExisting();
      if (raced) return raced;
    }
    throw err;
  }
}
