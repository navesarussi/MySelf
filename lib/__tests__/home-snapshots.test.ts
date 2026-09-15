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
  it("prefers live equity over starting equity", () => {
    const snap = shapeTradingSnapshot(
      {
        phase: "PAPER",
        peak_equity: 101500,
        starting_equity: 100000,
        kill_switch_active: false,
      },
      99850
    );
    assert.deepEqual(snap, { phase: "PAPER", equity: 99850, kill_switch_active: false });
  });
  it("falls back to starting equity when live equity is unavailable", () => {
    const snap = shapeTradingSnapshot({
      phase: "PAPER",
      peak_equity: 101500,
      starting_equity: 100000,
      kill_switch_active: false,
    });
    assert.deepEqual(snap, { phase: "PAPER", equity: 100000, kill_switch_active: false });
  });
  it("defaults phase and flags", () => {
    const snap = shapeTradingSnapshot({ starting_equity: "100000" });
    assert.equal(snap?.phase, "BACKTEST");
    assert.equal(snap?.equity, 100000);
    assert.equal(snap?.kill_switch_active, false);
  });
});
