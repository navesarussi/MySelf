import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenAtBroker, flattenTiming } from "../trading/broker/flatten";
import type { CloseOutcome } from "../trading/service-commands";
import { recordBrokerFlattenFailure } from "../trading/service-commands";

describe("recordBrokerFlattenFailure", () => {
  const empty = (): CloseOutcome => ({ closed: [], failed: [], estimated: [], queued: [] });

  it("queues stock_exit_queued_for_open instead of failing", () => {
    const out = empty();
    recordBrokerFlattenFailure(out, "AAPL", new Error("stock_exit_queued_for_open"));
    assert.deepEqual(out.queued, ["AAPL"]);
    assert.equal(out.failed.length, 0);
  });

  it("wraps other broker errors as failed", () => {
    const out = empty();
    recordBrokerFlattenFailure(out, "DOT", new Error("alpaca_close_still_held"));
    assert.deepEqual(out.failed, [{ symbol: "DOT", reason: "broker_flatten_failed: alpaca_close_still_held" }]);
    assert.equal(out.queued.length, 0);
  });
});

describe("manual close after flatten queues for open", () => {
  const realFetch = globalThis.fetch;
  const realSleep = flattenTiming.sleep;
  const realOpen = flattenTiming.marketOpen;

  beforeEach(() => {
    process.env.ALPACA_API_KEY_ID = "test";
    process.env.ALPACA_API_SECRET_KEY = "test";
    flattenTiming.sleep = async () => {};
    flattenTiming.marketOpen = async () => false;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    flattenTiming.sleep = realSleep;
    flattenTiming.marketOpen = realOpen;
  });

  it("does not land in failed (would have caused 409 on close_position)", async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      if (url.pathname === "/v2/positions/AAPL") {
        return new Response(JSON.stringify({ symbol: "AAPL", qty: "1", current_price: "340", market_value: "340" }));
      }
      if (url.pathname === "/v2/orders" && method === "GET") return new Response(JSON.stringify([]));
      if (url.pathname === "/v2/orders" && method === "POST") {
        return new Response(JSON.stringify({ id: "q1", status: "accepted" }));
      }
      return new Response("{}", { status: 500 });
    }) as typeof fetch;

    const t = { symbol: "AAPL", asset_class: "STOCK" as const, broker_entry_order_id: null, broker_stop_order_id: null, broker_target_order_id: null };
    const out: CloseOutcome = { closed: [], failed: [], estimated: [], queued: [] };
    try {
      await flattenAtBroker(t);
      assert.fail("expected queued throw");
    } catch (err) {
      recordBrokerFlattenFailure(out, t.symbol, err);
    }
    assert.deepEqual(out.queued, ["AAPL"]);
    assert.equal(out.failed.length, 0);
  });
});
