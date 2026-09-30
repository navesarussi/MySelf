import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inverseVolWeights, stdev, volTargetMultiplier } from "../trading/strategy/allocation";

describe("allocation", () => {
  it("population stdev", () => {
    assert.equal(stdev([1, 1, 1]), 0);
    assert.ok(Math.abs(stdev([1, -1]) - 1) < 1e-12);
  });
  it("vol targeting scales risk by target ÷ realized vol, capped", () => {
    const calm = Array.from({ length: 20 }, (_, i) => (i % 2 ? 0.001 : -0.001)); // σ 0.1%/day
    // realized 0.1%·√365 ≈ 1.9%/yr against a 10% target → 5.2×, capped at 1.5
    assert.equal(volTargetMultiplier(calm, { target_annual: 0.1, lookback: 20, min: 0.5, max: 1.5, periods_per_year: 365 }), 1.5);
    // exactly on target → 1
    const on = volTargetMultiplier(calm, { target_annual: 0.001 * Math.sqrt(365), lookback: 20, min: 0.5, max: 1.5, periods_per_year: 365 });
    assert.ok(Math.abs(on - 1) < 1e-9);
    const wild = Array.from({ length: 20 }, (_, i) => (i % 2 ? 0.05 : -0.05));
    assert.equal(volTargetMultiplier(wild, { target_annual: 0.1, lookback: 20, min: 0.5, max: 1.5, periods_per_year: 365 }), 0.5);
    assert.equal(volTargetMultiplier([0.01], { target_annual: 0.1, lookback: 20, min: 0.5, max: 1.5, periods_per_year: 365 }), 1, "not enough history → neutral");
  });
  it("inverse-vol weights average 1 across sleeves with history, neutral otherwise", () => {
    const series = new Map<string, number[]>([
      ["A", Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.01 : -0.01))],
      ["B", Array.from({ length: 60 }, (_, i) => (i % 2 ? 0.02 : -0.02))],
      ["C", [0.01]],
    ]);
    const w = inverseVolWeights(series, { lookback: 60, min: 0.25, max: 4 });
    assert.ok(Math.abs(w.get("A")! - 4 / 3) < 1e-9);
    assert.ok(Math.abs(w.get("B")! - 2 / 3) < 1e-9);
    assert.equal(w.get("C"), 1);
  });
});
