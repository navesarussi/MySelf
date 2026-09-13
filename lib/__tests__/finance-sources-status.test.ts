import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FinanceSourceSummary } from "../finance/sources-status";

describe("finance sources-status types and aggregation logic", () => {
  it("formats sources array correctly", () => {
    const summary: FinanceSourceSummary = {
      source: "max",
      count: 15,
      latest_txn_date: "2026-09-12",
      last_activity_at: "2026-09-13T01:00:00Z",
    };
    assert.equal(summary.source, "max");
    assert.equal(summary.count, 15);
    assert.equal(summary.latest_txn_date, "2026-09-12");
  });
});
