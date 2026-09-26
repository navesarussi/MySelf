import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NO_TARGET_R, TradeEditError, validateLevelEdit } from "../trading/trade-edit";

const base = { state: "OPEN" as const, entry: 100, stop: 95, target: 110, stopDistance: 5, live: 104 };

describe("validateLevelEdit (manual stop/target on the trade card)", () => {
  it("moves the stop up to lock profit and marks what changed", () => {
    const v = validateLevelEdit({ ...base, edit: { stop: 101 } });
    assert.equal(v.stop, 101);
    assert.equal(v.target, 110);
    assert.deepEqual(v.changed, { stop: true, target: false });
  });

  it("allows widening the stop (the trader decides) as long as it stays under the market", () => {
    assert.equal(validateLevelEdit({ ...base, edit: { stop: 90 } }).stop, 90);
  });

  it("refuses a stop at or above the market, and a target at or below it", () => {
    assert.throws(() => validateLevelEdit({ ...base, edit: { stop: 104 } }), (e: unknown) => e instanceof TradeEditError && e.message === "stop_above_price");
    assert.throws(() => validateLevelEdit({ ...base, edit: { target: 103 } }), (e: unknown) => e instanceof TradeEditError && e.message === "target_below_price");
  });

  it("removes the target by parking it far out (strategy exits decide)", () => {
    const v = validateLevelEdit({ ...base, edit: { target: null } });
    assert.equal(v.target, 100 + NO_TARGET_R * 5);
  });

  it("refuses edits on a trade that has no position", () => {
    assert.throws(() => validateLevelEdit({ ...base, state: "PENDING", edit: { stop: 96 } }), /trade_not_open/);
    assert.throws(() => validateLevelEdit({ ...base, entry: null, edit: { stop: 96 } }), /no_fill_yet/);
  });

  it("falls back to the entry when no live price is available", () => {
    assert.throws(() => validateLevelEdit({ ...base, live: null, edit: { stop: 100 } }), /stop_above_price/);
    assert.equal(validateLevelEdit({ ...base, live: null, edit: { stop: 99 } }).stop, 99);
  });
});
