import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampSellQty } from "../trading/broker/alpaca";

describe("clampSellQty", () => {
  it("never asks for more than the broker holds", () => {
    // The live failure: Alpaca takes the crypto fee in the asset, so the balance
    // after an entry fill sits ~0.15% below filled_qty. Selling the fill was
    // rejected with `insufficient balance` and the protective stop never landed.
    const intended = 25514.048; // filled_qty
    const available = 25475.777808677; // what Alpaca actually reported held
    const qty = clampSellQty(intended, available, "CRYPTO_ALT");
    assert.ok(qty !== null);
    assert.ok(qty <= available, `${qty} must not exceed ${available}`);
  });

  it("handles a meme-coin sized balance without exceeding it", () => {
    const available = 6466430959.524361648; // PEPE, from the same incident
    const qty = clampSellQty(available * 1.0015, available, "CRYPTO_ALT");
    assert.ok(qty !== null);
    assert.ok(qty <= available, `${qty} must not exceed ${available}`);
  });

  it("keeps the intended size when the broker holds more", () => {
    assert.equal(clampSellQty(5, 10, "CRYPTO_ALT"), 5);
  });

  it("floors stock quantities to whole shares", () => {
    assert.equal(clampSellQty(10.9, 10.9, "STOCK"), 10);
  });

  it("floors crypto to six decimals", () => {
    assert.equal(clampSellQty(1.23456789, 2, "CRYPTO_ALT"), 1.234567);
  });

  it("returns null when nothing is held", () => {
    assert.equal(clampSellQty(10, 0, "CRYPTO_ALT"), null);
    assert.equal(clampSellQty(10, Number.NaN, "CRYPTO_ALT"), null);
  });

  it("returns null when the holding rounds away to nothing", () => {
    // Below one whole share there is nothing sellable for a stock.
    assert.equal(clampSellQty(0.4, 0.4, "STOCK"), null);
  });

  it("falls back to the full holding when the intended size is unusable", () => {
    assert.equal(clampSellQty(Number.NaN, 3, "CRYPTO_ALT"), 3);
    assert.equal(clampSellQty(0, 3, "CRYPTO_ALT"), 3);
  });
});
