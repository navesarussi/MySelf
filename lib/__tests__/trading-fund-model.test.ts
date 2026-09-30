import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { modelDayFrom } from "../trading/fund/model-book";

const T = Date.parse("2026-09-29T00:00:00Z");
const D1 = 86_400_000;
const result = {
  equity: [{ t: T - D1, equity: 100_000 }, { t: T, equity: 101_000 }],
  trades: [
    { strategy: "REVERSAL", symbol: "AMD", closed_at: T, pnl: 200, r: 0.8, exit_reason: "SIGNAL" },
    { strategy: "MOMENTUM", symbol: "NVDA", closed_at: T, pnl: 50, r: 0.1, exit_reason: "MANUAL" },
    { strategy: "REVERSAL", symbol: "OLD", closed_at: T - D1, pnl: 9, r: 0.1, exit_reason: "SIGNAL" },
  ],
  open_at_end: [{ symbol: "NVDA", strategy: "MOMENTUM", size: 3, entry: 100, stop: 80, opened_at: T - 5 * D1, pending: false }],
} as never;

describe("model day", () => {
  it("takes the bar's return, open positions and the trades the strategies closed on the bar", () => {
    const d = modelDayFrom(result, T, "STOCKS")!;
    assert.equal(d.day, "2026-09-29");
    assert.ok(Math.abs(d.day_return - 0.01) < 1e-12);
    assert.equal(d.equity, 101_000);
    assert.deepEqual(d.positions.map((p) => p.symbol), ["NVDA"]);
    assert.equal(d.positions[0].opened_at, "2026-09-24");
    assert.deepEqual(d.trades.map((x) => x.symbol), ["AMD"]);
  });
  it("is null when the bar is not the last point of the curve", () => {
    assert.equal(modelDayFrom(result, T + D1, "STOCKS"), null);
  });
});
