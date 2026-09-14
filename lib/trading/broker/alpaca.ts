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
export type AlpacaPosition = { symbol: string; qty: string; avg_entry_price: string; current_price: string; unrealized_pl: string };

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

/** Tick-size rounding Alpaca accepts: stocks ≥ $1 → cents; crypto → magnitude-based. */
export function roundPrice(price: number, assetClass: AssetClass) {
  if (assetClass === "STOCK") return Math.round(price * (price >= 1 ? 100 : 10_000)) / (price >= 1 ? 100 : 10_000);
  const decimals = price >= 1000 ? 2 : price >= 1 ? 4 : 6;
  return Math.round(price * 10 ** decimals) / 10 ** decimals;
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
      ...(market ? {} : { limit_price: String(roundPrice(input.limit, input.assetClass)) }),
      client_order_id: input.clientId,
    };
    if (input.assetClass === "STOCK" && input.bracket !== false) {
      return call<AlpacaOrder>("POST", "/v2/orders", {
        ...base,
        order_class: "bracket",
        take_profit: { limit_price: String(roundPrice(input.target, "STOCK")) },
        stop_loss: { stop_price: String(roundPrice(input.stop, "STOCK")) },
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
      stop_price: String(roundPrice(input.stop, "CRYPTO_ALT")),
      limit_price: String(roundPrice(input.stop * 0.99, "CRYPTO_ALT")),
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
      stop_price: String(roundPrice(input.stop, "STOCK")),
      client_order_id: input.clientId,
    });
  },

  getOrder: (id: string) => call<AlpacaOrder>("GET", `/v2/orders/${id}?nested=true`),

  /** Replace returns a NEW order id. */
  replaceOrder: (id: string, patch: { stop_price?: number; limit_price?: number }, assetClass: AssetClass) =>
    call<AlpacaOrder>("PATCH", `/v2/orders/${id}`, {
      ...(patch.stop_price !== undefined ? { stop_price: String(roundPrice(patch.stop_price, assetClass)) } : {}),
      ...(patch.limit_price !== undefined ? { limit_price: String(roundPrice(patch.limit_price, assetClass)) } : {}),
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

  /** Market-close the whole position. Cancel the protective orders first — they reserve the quantity. */
  closePosition: (symbol: string, assetClass: AssetClass) =>
    call<AlpacaOrder>("DELETE", `/v2/positions/${encodeURIComponent(alpacaPositionSymbol(symbol, assetClass))}`),
};

/**
 * Flatten one strategy position at the broker: cancel its entry/protective orders, market-close what is
 * held, and return the close fill price when available (null = nothing held / price not reported yet).
 */
export async function flattenAtBroker(t: { symbol: string; asset_class: AssetClass; broker_entry_order_id: string | null; broker_stop_order_id: string | null; broker_target_order_id: string | null }): Promise<number | null> {
  for (const id of [t.broker_entry_order_id, t.broker_stop_order_id, t.broker_target_order_id]) if (id) await alpaca.cancelOrder(id);
  const held = await alpaca.position(t.symbol, t.asset_class);
  if (!held || Number(held.qty) <= 0) return null;
  const order = await alpaca.closePosition(t.symbol, t.asset_class);
  await new Promise((r) => setTimeout(r, 1500));
  const filled = await alpaca.getOrder(order.id).catch(() => null);
  const px = Number(filled?.filled_avg_price);
  return Number.isFinite(px) && px > 0 ? px : Number(held.current_price) || null;
}
