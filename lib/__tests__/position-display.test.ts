import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { positionPriceView } from "../trading/position-display";

describe("positionPriceView", () => {
  const base = {
    entry_price: 100,
    stop_price: 95,
    target_price: 110,
    last_price: null as number | null,
  };

  it("prefers live price over the dashboard snapshot", () => {
    const view = positionPriceView({ ...base, last_price: 102 }, 105);
    assert.equal(view.lastPrice, 105);
    assert.equal(view.currentR, 1);
  });

  it("falls back to server last_price when live is unavailable", () => {
    const view = positionPriceView({ ...base, last_price: 103 }, null);
    assert.equal(view.lastPrice, 103);
    assert.equal(view.currentR, 0.6);
  });

  it("computes slider progress between stop and target", () => {
    const view = positionPriceView({ ...base, last_price: 102.5 }, null);
    assert.equal(view.progress, 0.5);
    assert.equal(view.distanceToStopPct, 0.0732);
  });

  it("returns null metrics when no price is available", () => {
    const view = positionPriceView(base, null);
    assert.equal(view.lastPrice, null);
    assert.equal(view.currentR, null);
    assert.equal(view.progress, null);
  });
});
