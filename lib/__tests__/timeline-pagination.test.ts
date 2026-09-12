import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTimelineCursor, parseTimelineCursor } from "../timeline-pagination";

describe("timeline-pagination", () => {
  it("round-trips cursor", () => {
    const cursor = buildTimelineCursor({ event_date: "2026-09-01", id: "abc-123" });
    assert.deepEqual(parseTimelineCursor(cursor), { date: "2026-09-01", id: "abc-123" });
  });

  it("rejects invalid cursor", () => {
    assert.equal(parseTimelineCursor("nope"), null);
    assert.equal(parseTimelineCursor("|id"), null);
  });
});
