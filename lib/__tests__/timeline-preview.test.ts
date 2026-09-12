import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leanTimelineEventForList } from "../timeline-preview";
import type { TimelineEvent } from "../types";

function event(partial: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: "1",
    event_date: "2026-09-01",
    event_time: null,
    title: "Title",
    description: null,
    category: null,
    min_zoom: "months",
    source: "manual",
    google_event_id: null,
    title_override: null,
    description_override: null,
    hidden_at: null,
    synced_at: null,
    created_at: "",
    ...partial,
  };
}

describe("leanTimelineEventForList", () => {
  it("truncates long merged descriptions", () => {
    const long = "x".repeat(300);
    const lean = leanTimelineEventForList(event({ description: long }));
    assert.equal(lean.description?.length, 200);
    assert.equal(lean.description_override, null);
  });

  it("prefers description_override when building preview", () => {
    const lean = leanTimelineEventForList(
      event({ description: "base", description_override: "override text" })
    );
    assert.equal(lean.description, "override text");
    assert.equal(lean.description_override, null);
  });
});
