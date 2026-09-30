import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeSignalRows, signalRow } from "../trading/fund/signal-log";

const sig = { strategy: "REVERSAL", score: 0.8, entry: 100, stop: 90, target: null, a: { symbol: "NVDA" } } as never;

describe("signal log rows", () => {
  it("records an entry with its planned size and trade", () => {
    const r = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "ENTERED", size: 10, riskUsd: 100, tradeId: "t1" });
    assert.deepEqual(r, { bar: "2026-09-29", grp: "STOCKS", strategy: "REVERSAL", symbol: "NVDA", score: 0.8, entry: 100, stop: 90, target: null, planned_size: 10, planned_risk_usd: 100, decision: "ENTERED", trade_id: "t1" });
  });
  it("records a block with nulls for size and trade", () => {
    const r = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "MAX_GROSS" });
    assert.equal(r.planned_size, null);
    assert.equal(r.trade_id, null);
    assert.equal(r.decision, "MAX_GROSS");
  });
  it("keeps the last decision per (bar, strategy, symbol)", () => {
    const a = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "MAX_GROSS" });
    const b = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "ENTERED", tradeId: "t1" });
    assert.deepEqual(dedupeSignalRows([a, b]), [b]);
  });
});
