import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectHomeEvents } from "../home-events";

function ev(id: string, event_date: string, event_time: string | null = null) {
  return { id, event_date, event_time, hidden_at: null };
}

describe("selectHomeEvents", () => {
  const now = new Date("2026-07-17T12:00:00");

  it("returns upcoming when at least one future event is in the current year", () => {
    const events = [
      ev("past", "2026-01-01"),
      ev("soon", "2026-07-20"),
      ev("later", "2027-01-01"),
    ];
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.mode, "upcoming");
    assert.deepEqual(
      result.events.map((e) => e.id),
      ["soon", "later"]
    );
  });

  it("falls back to recent when no upcoming event in current year", () => {
    const events = [
      ev("old", "2025-12-01"),
      ev("newer", "2026-03-01"),
      ev("far", "2027-06-01"),
    ];
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.mode, "recent");
    assert.deepEqual(
      result.events.map((e) => e.id),
      ["newer", "old"]
    );
  });

  it("ignores hidden events", () => {
    const events = [
      { id: "hidden", event_date: "2026-08-01", event_time: null, hidden_at: "2026-01-01" },
      ev("ok", "2026-08-02"),
    ];
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.mode, "upcoming");
    assert.deepEqual(
      result.events.map((e) => e.id),
      ["ok"]
    );
  });

  it("limits to 10", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      ev(`e${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`)
    );
    const result = selectHomeEvents(events, now, 10);
    assert.equal(result.events.length, 10);
  });
});
