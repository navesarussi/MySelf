import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatUpdatedSecondsAgo,
  secondsSinceUpdated,
  tradingEquityTone,
  tradingPnl,
} from "../trading/equity-display";

describe("tradingPnl", () => {
  it("rounds to whole dollars", () => {
    assert.equal(tradingPnl(78_701.4, 100_000), -21_299);
    assert.equal(tradingPnl(100_000.6, 100_000), 1);
  });
});

describe("tradingEquityTone", () => {
  it("warns on kill switch or negative pnl", () => {
    assert.equal(tradingEquityTone(-100, false), "warn");
    assert.equal(tradingEquityTone(500, true), "warn");
    assert.equal(tradingEquityTone(500, false), "good");
  });
});

describe("updated freshness labels", () => {
  it("counts seconds since ISO timestamp", () => {
    const now = Date.parse("2026-09-26T14:00:10.000Z");
    assert.equal(secondsSinceUpdated("2026-09-26T14:00:00.000Z", now), 10);
  });

  it("formats he/en labels", () => {
    assert.equal(formatUpdatedSecondsAgo(3, "he"), "עודכן עכשיו");
    assert.equal(formatUpdatedSecondsAgo(12, "en"), "Updated 12s ago");
    assert.equal(formatUpdatedSecondsAgo(90, "he"), "עודכן לפני 1 דק׳");
  });
});
