import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { livePrice } from "../trading/intraday-data";

describe("livePrice stock fallback", () => {
  const origFetch = globalThis.fetch;
  const origKey = process.env.ALPACA_API_KEY_ID;
  const origSecret = process.env.ALPACA_API_SECRET_KEY;

  beforeEach(() => {
    process.env.ALPACA_API_KEY_ID = "test-key";
    process.env.ALPACA_API_SECRET_KEY = "test-secret";
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.ALPACA_API_KEY_ID;
    else process.env.ALPACA_API_KEY_ID = origKey;
    if (origSecret === undefined) delete process.env.ALPACA_API_SECRET_KEY;
    else process.env.ALPACA_API_SECRET_KEY = origSecret;
  });

  it("uses latest IEX trade when present", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/trades/latest")) {
        return new Response(JSON.stringify({ trades: { XNCR: { p: 12.34 } } }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const price = await livePrice({ symbol: "XNCR", asset_class: "STOCK", provider_symbol: "XNCR" });
    assert.equal(price, 12.34);
  });

  it("falls back to snapshot daily close when latest IEX trade is missing", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/trades/latest")) {
        return new Response(JSON.stringify({ trades: {} }), { status: 200 });
      }
      if (u.includes("/snapshots")) {
        return new Response(
          JSON.stringify({
            XNCR: {
              dailyBar: { t: "2026-09-28T00:00:00Z", o: 10, h: 11, l: 9, c: 10.5, v: 1000 },
              latestTrade: null,
            },
          }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const price = await livePrice({ symbol: "XNCR", asset_class: "STOCK", provider_symbol: "XNCR" });
    assert.equal(price, 10.5);
  });

  it("returns null when every stock fallback fails", async () => {
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/trades/latest")) {
        return new Response(JSON.stringify({ trades: {} }), { status: 200 });
      }
      if (u.includes("/snapshots")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    };
    const price = await livePrice({ symbol: "XNCR", asset_class: "STOCK", provider_symbol: "XNCR" });
    assert.equal(price, null);
  });
});
