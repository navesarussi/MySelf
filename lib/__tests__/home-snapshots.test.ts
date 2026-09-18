import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currentMonthKey, shapeTradingSnapshot } from "../home-snapshots";

describe("currentMonthKey", () => {
  it("pads month", () => {
    assert.equal(currentMonthKey(new Date(2026, 8, 14)), "2026-09");
  });
});

describe("shapeTradingSnapshot", () => {
  it("returns null when the settings row is missing", () => {
    assert.equal(shapeTradingSnapshot(null), null);
  });
  it("uses live equity when provided", () => {
    const snap = shapeTradingSnapshot(
      {
        phase: "PAPER",
        peak_equity: 101500,
        starting_equity: 100000,
        kill_switch_active: false,
      },
      99659
    );
    assert.deepEqual(snap, {
      phase: "PAPER",
      equity: 99659,
      starting_equity: 100000,
      kill_switch_active: false,
    });
  });
  it("falls back to starting equity without live value", () => {
    const snap = shapeTradingSnapshot({ starting_equity: "100000" });
    assert.equal(snap?.phase, "BACKTEST");
    assert.equal(snap?.equity, 100000);
    assert.equal(snap?.starting_equity, 100000);
    assert.equal(snap?.kill_switch_active, false);
  });
});
