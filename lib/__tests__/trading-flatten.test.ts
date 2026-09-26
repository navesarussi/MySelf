import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenAtBroker, flattenTiming } from "../trading/broker/flatten";

/**
 * A fake Alpaca paper account behind `fetch`, reproducing what closing DOT looked like on 2026-09-26:
 * the crypto engine fills a large market close in pieces (fill part, cancel the rest), the position
 * endpoint lags the fill by a few reads, and closing an already-sold position returns 404.
 */
function fakeAlpaca(opts: { qty: number; chunk: number; lagReads: number; price: number }) {
  let qty = opts.qty;
  let reportedQty = qty;
  let lag = 0;
  const orders = new Map<string, Record<string, unknown>>();
  let n = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const fetchStub = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname;
    if (method === "GET" && path === "/v2/orders") return json([]);
    if (method === "DELETE" && path.startsWith("/v2/orders/")) return new Response(null, { status: 204 });
    if (method === "GET" && path.startsWith("/v2/orders/")) return json(orders.get(path.split("/").pop()!));
    if (path === "/v2/positions/DOTUSD") {
      if (method === "GET") {
        if (lag > 0) lag -= 1;
        else reportedQty = qty;
        return reportedQty > 0 ? json({ symbol: "DOTUSD", qty: String(reportedQty), current_price: String(opts.price), market_value: String(reportedQty * opts.price), avg_entry_price: "1", unrealized_pl: "0" }) : json({ message: "position does not exist" }, 404);
      }
      if (method === "DELETE") {
        if (qty <= 0) return json({ message: "position does not exist" }, 404);
        const sold = Math.min(qty, opts.chunk);
        qty -= sold;
        lag = opts.lagReads;
        const id = `o${++n}`;
        orders.set(id, { id, status: qty > 0 ? "canceled" : "filled", filled_qty: String(sold), filled_avg_price: String(opts.price), qty: String(sold + qty) });
        return json(orders.get(id));
      }
    }
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };
  return { fetchStub, remaining: () => qty, closes: () => n };
}

describe("flattenAtBroker on the paper engine", () => {
  const realFetch = globalThis.fetch;
  const realSleep = flattenTiming.sleep;
  beforeEach(() => {
    process.env.ALPACA_API_KEY_ID = "test";
    process.env.ALPACA_API_SECRET_KEY = "test";
    flattenTiming.sleep = async () => {};
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    flattenTiming.sleep = realSleep;
  });

  const trade = { symbol: "DOT", asset_class: "CRYPTO_ALT" as const, broker_entry_order_id: null, broker_stop_order_id: null, broker_target_order_id: null };

  it("sells a position that fills in pieces and reports flat despite the lagging position read", async () => {
    const fake = fakeAlpaca({ qty: 24_739.5, chunk: 8_000, lagReads: 2, price: 1.21 });
    globalThis.fetch = fake.fetchStub as typeof fetch;
    const px = await flattenAtBroker(trade);
    assert.equal(fake.remaining(), 0);
    assert.equal(px, 1.21);
    assert.equal(fake.closes(), 4);
  });

  it("treats a 404 on close (already sold) as flat instead of a failed close", async () => {
    // Every read lags long enough that the loop issues one more close after the last piece sold.
    const fake = fakeAlpaca({ qty: 10_000, chunk: 10_000, lagReads: 10, price: 1.2 });
    globalThis.fetch = fake.fetchStub as typeof fetch;
    const px = await flattenAtBroker(trade);
    assert.equal(fake.remaining(), 0);
    assert.equal(px, 1.2);
  });
});
