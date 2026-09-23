import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orphansToReport, orphanReportDay } from "../trading/broker/orphan-report";

/**
 * A broker position the strategy never owned is a real thing to tell the user
 * about — and it is also permanent until they act on it, because the code
 * deliberately will not close a position it does not own.
 *
 * Re-logging it every tick turned one standing condition into ~1,150 rows a day
 * and 80% of the entire trading event log, burying the events that matter
 * (fills, closes, kill switch) in the feed the dashboard renders.
 */
describe("orphansToReport", () => {
  it("reports a symbol that has not been reported today", () => {
    assert.deepEqual(orphansToReport(["ETH", "SPY"], []), ["ETH", "SPY"]);
  });

  it("stays quiet about symbols already reported today", () => {
    assert.deepEqual(orphansToReport(["ETH", "SPY"], ["ETH", "SPY"]), []);
  });

  it("reports only what is new", () => {
    assert.deepEqual(orphansToReport(["ETH", "SPY", "MSFT"], ["ETH"]), ["SPY", "MSFT"]);
  });

  it("does not care about the order or duplicates of what was reported", () => {
    assert.deepEqual(orphansToReport(["ETH"], ["SPY", "ETH", "ETH"]), []);
  });

  it("collapses a symbol listed twice in one pass", () => {
    assert.deepEqual(orphansToReport(["ETH", "ETH"], []), ["ETH"]);
  });

  it("handles nothing to report", () => {
    assert.deepEqual(orphansToReport([], ["ETH"]), []);
  });

  it("ignores case and padding, so a symbol is not reported twice under two spellings", () => {
    assert.deepEqual(orphansToReport([" eth "], ["ETH"]), []);
    assert.deepEqual(orphansToReport(["eth"], []), ["eth"], "the caller's spelling is preserved");
  });
});

describe("orphanReportDay", () => {
  it("is the UTC day, so the window resets once a day regardless of timezone", () => {
    assert.equal(orphanReportDay(new Date("2026-09-23T13:46:00.000Z")), "2026-09-23");
    assert.equal(orphanReportDay(new Date("2026-09-23T23:59:59.000Z")), "2026-09-23");
    assert.equal(orphanReportDay(new Date("2026-09-24T00:00:00.000Z")), "2026-09-24");
  });
});
