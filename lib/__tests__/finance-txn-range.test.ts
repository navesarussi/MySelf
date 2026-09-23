import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthBounds, monthsBounds } from "../finance/txn-range";

/**
 * Four modules each carried their own copy of "first of this month, first of
 * next" — including the December rollover, which is the part that is easy to
 * get wrong and impossible to notice until the year turns.
 */
describe("monthBounds", () => {
  it("spans the month, end-exclusive", () => {
    assert.deepEqual(monthBounds("2026-09"), { start: "2026-09-01", end: "2026-10-01" });
    assert.deepEqual(monthBounds("2026-02"), { start: "2026-02-01", end: "2026-03-01" });
  });

  it("rolls over the year in December", () => {
    assert.deepEqual(monthBounds("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
  });

  it("keeps two-digit months padded", () => {
    assert.deepEqual(monthBounds("2026-01"), { start: "2026-01-01", end: "2026-02-01" });
    assert.deepEqual(monthBounds("2026-09"), { start: "2026-09-01", end: "2026-10-01" });
  });

  it("rejects a malformed month rather than computing nonsense", () => {
    for (const bad of ["2026", "2026-13", "26-09", "", "2026-9"]) {
      assert.throws(() => monthBounds(bad), /invalid_month/, `rejected: ${JSON.stringify(bad)}`);
    }
  });
});

describe("monthsBounds", () => {
  it("spans from the first month to the end of the last", () => {
    assert.deepEqual(monthsBounds(["2026-07", "2026-08", "2026-09"]), {
      start: "2026-07-01",
      end: "2026-10-01",
    });
  });

  it("handles a single month", () => {
    assert.deepEqual(monthsBounds(["2026-09"]), { start: "2026-09-01", end: "2026-10-01" });
  });

  it("crosses a year boundary", () => {
    assert.deepEqual(monthsBounds(["2026-11", "2026-12", "2027-01"]), {
      start: "2026-11-01",
      end: "2027-02-01",
    });
  });

  it("is not fooled by an unsorted list", () => {
    assert.deepEqual(monthsBounds(["2026-09", "2026-07", "2026-08"]), {
      start: "2026-07-01",
      end: "2026-10-01",
    });
  });

  it("rejects an empty list", () => {
    assert.throws(() => monthsBounds([]), /invalid_month/);
  });
});
