import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatTxnDateTime, parseTxnTime } from "../finance/txn-datetime";

describe("txn-datetime", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    assert.equal(parseTxnTime("14:30"), "14:30");
    assert.equal(parseTxnTime("09:05:00"), "09:05");
    assert.equal(parseTxnTime("25:00"), null);
  });

  it("formats date with optional time", () => {
    assert.equal(formatTxnDateTime("2026-09-01", null), "2026-09-01");
    assert.equal(formatTxnDateTime("2026-09-01", "14:30"), "2026-09-01 14:30");
  });
});
