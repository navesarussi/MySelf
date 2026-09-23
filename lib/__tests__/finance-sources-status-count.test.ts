import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeSourceRows, type SourceProbe } from "../finance/sources-status";

/**
 * `getFinanceSourcesStatus` used to `select()` every transaction of every
 * tracked source with no limit, then count them in JS. Past PostgREST's row cap
 * that returns a prefix, so the per-source `count` the app shows silently stops
 * growing — a personal finance history crosses 1000 rows in months. It also
 * pulled the whole table across the wire to produce four numbers.
 *
 * The count now comes from the database and the dates from one row each, so
 * these pure helpers only have to assemble the probe results.
 */
describe("summarizeSourceRows", () => {
  const probe = (partial: Partial<SourceProbe> = {}): SourceProbe => ({
    count: 0,
    latest_txn_date: null,
    last_activity_at: null,
    ...partial,
  });

  it("returns one summary per tracked source, in a stable order", () => {
    const out = summarizeSourceRows(new Map());
    assert.deepEqual(
      out.map((s) => s.source),
      ["leumi", "apple_pay", "max", "visa_cal"]
    );
  });

  it("reports zeroes for a source that has never synced", () => {
    const out = summarizeSourceRows(new Map());
    for (const s of out) {
      assert.equal(s.count, 0);
      assert.equal(s.latest_txn_date, null);
      assert.equal(s.last_activity_at, null);
    }
  });

  it("carries the database count through rather than counting rows in memory", () => {
    const out = summarizeSourceRows(
      new Map([["leumi", probe({ count: 4213, latest_txn_date: "2026-09-22", last_activity_at: "2026-09-23T06:00:00.000Z" })]])
    );
    const leumi = out.find((s) => s.source === "leumi")!;
    assert.equal(leumi.count, 4213, "a count past the row cap must survive");
    assert.equal(leumi.latest_txn_date, "2026-09-22");
    assert.equal(leumi.last_activity_at, "2026-09-23T06:00:00.000Z");
  });

  it("keeps the newest transaction date apart from the last sync time", () => {
    // A transaction imported today can carry an old txn_date — the two answer
    // different questions ("how current is the data" vs "when did it last run").
    const out = summarizeSourceRows(
      new Map([["max", probe({ count: 2, latest_txn_date: "2026-08-01", last_activity_at: "2026-09-23T10:00:00.000Z" })]])
    );
    const max = out.find((s) => s.source === "max")!;
    assert.equal(max.latest_txn_date, "2026-08-01");
    assert.equal(max.last_activity_at, "2026-09-23T10:00:00.000Z");
  });

  it("leaves untracked sources out entirely", () => {
    const out = summarizeSourceRows(new Map([["manual" as never, probe({ count: 99 })]]));
    assert.equal(out.length, 4);
    assert.ok(!out.some((s) => (s.source as string) === "manual"));
  });
});
