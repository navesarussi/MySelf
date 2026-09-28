import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fillStockPricesFromSnapshots, type StockSnapshot } from "../trading/broker/alpaca-data";

const snap = (price: number): StockSnapshot => ({ o: price - 1, h: price + 1, l: price - 2, c: price, v: 1000, price, at: Date.now() });

describe("stock live price fallback", () => {
  it("uses latest IEX trade when present", () => {
    const latest = new Map([["PAYC", 285.5]]);
    const out = fillStockPricesFromSnapshots(latest, new Map(), ["PAYC"]);
    assert.equal(out.get("PAYC"), 285.5);
  });

  it("falls back to snapshot daily bar close when latest trade is absent", () => {
    const latest = new Map<string, number>();
    const snapshots = new Map([["PAYC", snap(283.25)]]);
    const out = fillStockPricesFromSnapshots(latest, snapshots, ["PAYC"]);
    assert.equal(out.get("PAYC"), 283.25);
  });

  it("leaves symbol unset when neither latest trade nor snapshot has a price", () => {
    const out = fillStockPricesFromSnapshots(new Map(), new Map(), ["PAYC"]);
    assert.equal(out.has("PAYC"), false);
  });
});
