import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtDuration } from "../trading/format";

/**
 * Holding periods in this system span three orders of magnitude — a 5-minute
 * intraday scalp, a multi-hour swing, a daily-trend position held for a week —
 * so one fixed unit reads badly at both ends.
 */
describe("fmtDuration", () => {
  it("uses minutes under an hour", () => {
    assert.equal(fmtDuration(0.25), "15m");
    assert.equal(fmtDuration(0.5), "30m");
    assert.equal(fmtDuration(0), "0m");
  });

  it("uses hours up to two days, with a decimal only while it matters", () => {
    assert.equal(fmtDuration(1), "1.0h");
    assert.equal(fmtDuration(6.5), "6.5h");
    assert.equal(fmtDuration(30), "30h");
  });

  it("uses days beyond that", () => {
    assert.equal(fmtDuration(48), "2.0d");
    assert.equal(fmtDuration(72), "3.0d");
  });

  it("returns a dash for a missing or impossible duration", () => {
    assert.equal(fmtDuration(null), "—");
    assert.equal(fmtDuration(undefined), "—");
    assert.equal(fmtDuration(NaN), "—");
    assert.equal(fmtDuration(Infinity), "—");
    assert.equal(fmtDuration(-1), "—");
  });
});
