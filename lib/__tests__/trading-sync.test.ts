import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forceClose, newPendingPosition, stepPosition } from "../trading/position";
import { revertFailedBrokerClose } from "../trading/broker/revert-close";
import { fromAlpacaPositionSymbol, isAlpacaInsufficientQty } from "../trading/broker/alpaca";
import { matchBrokerOrphans } from "../trading/broker/reconcile";
import { isTrendRide, timeStopReason } from "../trading/trend-ride";
import type { Bar } from "../trading/types";

const bar = (t: number, o: number, h: number, l: number, c: number): Bar => ({ t, o, h, l, c, v: 1000 });

function filledIntraday() {
  const p = newPendingPosition({ asset_class: "CRYPTO_ALT", entry: 10, stop: 9.5, size: 100 });
  p.exit_plan = "STRUCTURAL";
  p.target_price = 11; // 2R
  p.initial_target_price = 11;
  p.breakeven_at_r = 1;
  p.partial_fraction = 0;
  p.trail_after_r = 1.5;
  p.trail_mult = 2;
  stepPosition(p, bar(1, 10, 10.05, 9.98, 10.02), { atr: 0.2 });
  return p;
}

describe("trend ride (let winners run)", () => {
  it("skips the original 2R target once the trail threshold is earned", () => {
    const p = filledIntraday();
    // Bar that blows through 2R (target 11) well past trail_after_r 1.5.
    stepPosition(p, bar(2, 10.1, 12.5, 10.05, 12.2), { atr: 0.2, let_winners_run: true });
    assert.notEqual(p.state, "CLOSED");
    assert.equal(p.exit_reason, null);
    assert.ok(p.mfe_r >= 1.5);
  });

  it("still clips at target when let_winners_run is off (v2 / daily-trend)", () => {
    const p = filledIntraday();
    stepPosition(p, bar(2, 10.1, 12.5, 10.05, 12.2), { atr: 0.2 });
    assert.equal(p.state, "CLOSED");
    assert.equal(p.exit_reason, "TARGET");
  });

  it("time-stops chop but not a working trend", () => {
    const chop = filledIntraday();
    assert.equal(timeStopReason(chop, true), "TIME_STOP");
    const trend = filledIntraday();
    stepPosition(trend, bar(2, 10.1, 11.2, 10.05, 11.1), { atr: 0.2, let_winners_run: true });
    assert.ok(isTrendRide(trend));
    assert.equal(timeStopReason(trend, true), undefined);
  });
});

describe("broker close revert", () => {
  it("restores an OPEN position after a simulated close the broker rejected", () => {
    const p = filledIntraday();
    const cashOpen = p.cash_flow;
    forceClose(p, 11, "TARGET", 99);
    assert.equal(p.state, "CLOSED");
    assert.equal(p.size, 0);
    assert.ok(revertFailedBrokerClose(p));
    assert.equal(p.state, "OPEN");
    assert.equal(p.size, 100);
    assert.equal(p.exit_reason, null);
    assert.equal(p.closed_at, null);
    assert.ok(Math.abs(p.cash_flow - cashOpen) < 1e-6);
  });
});

describe("broker orphan matching", () => {
  it("maps Alpaca position symbols back to ours", () => {
    assert.equal(fromAlpacaPositionSymbol("AVAXUSD"), "AVAX");
    assert.equal(fromAlpacaPositionSymbol("AAPL"), "AAPL");
  });

  it("reopens a journal-closed trade the broker still holds; leaves unknowns alone", () => {
    const r = matchBrokerOrphans(
      [
        { symbol: "AVAXUSD", qty: 1509 },
        { symbol: "AAPL", qty: 1 },
      ],
      new Set(["FORM"]),
      new Map([["AVAX", { id: "t-avax" }]])
    );
    assert.deepEqual(r.reopenIds, ["t-avax"]);
    assert.deepEqual(r.unknownSymbols, ["AAPL"]);
  });

  it("does not reopen a symbol that already has an open trade", () => {
    const r = matchBrokerOrphans([{ symbol: "AVAXUSD", qty: 10 }], new Set(["AVAX"]), new Map([["AVAX", { id: "t-avax" }]]));
    assert.deepEqual(r.reopenIds, []);
    assert.deepEqual(r.unknownSymbols, []);
  });
});

describe("alpaca insufficient-qty detection", () => {
  it("recognizes the 403 that means a protective order still reserves the size", () => {
    assert.ok(isAlpacaInsufficientQty(new Error('alpaca_403:{"available":"0.000000364","balance":"1509.93","code":40310000}')));
    assert.ok(!isAlpacaInsufficientQty(new Error("alpaca_422:unprocessable")));
  });
});
