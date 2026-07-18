import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignClusterLanes,
  clampSpanX,
  clusterEvents,
  clusterZoomTarget,
  dedupeEvents,
  stablePeriodLanes,
  visibleLabelSegment,
} from "../timeline-engine";
import { toTime, eventDateTime } from "../timeline-layout";
import type { LifePeriod } from "../life-periods";
import type { TimelineEvent } from "../types";

function ev(partial: Partial<TimelineEvent> & { id: string; event_date: string }): TimelineEvent {
  return {
    event_time: null,
    title: partial.id,
    description: null,
    category: null,
    min_zoom: "months",
    source: "manual",
    google_event_id: null,
    title_override: null,
    description_override: null,
    hidden_at: null,
    synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  } as TimelineEvent;
}

describe("stablePeriodLanes", () => {
  const periods = [
    { id: "childhood", title: "ילדות", start_date: "2002-01-02", end_date: "2021-12-22" },
    { id: "army", title: "צבא", start_date: "2021-12-23", end_date: "2025-04-19" },
    { id: "relationship", title: "זוגיות", start_date: "2023-07-26", end_date: null },
    { id: "australia", title: "אוסטרליה", start_date: "2026-04-08", end_date: null },
    { id: "kupapay", title: "KupaPay", start_date: "2026-06-01", end_date: null },
  ] as LifePeriod[];

  it("does not depend on any viewport", () => {
    const a = stablePeriodLanes(periods, "2026-07-16");
    const b = stablePeriodLanes([...periods].reverse(), "2026-07-16");
    assert.deepEqual(Object.fromEntries(a.lanes), Object.fromEntries(b.lanes));
    assert.equal(a.laneCount, b.laneCount);
  });

  it("packs non-overlapping periods into the same lane", () => {
    const { lanes } = stablePeriodLanes(periods, "2026-07-16");
    assert.equal(lanes.get("childhood"), lanes.get("army"));
  });

  it("separates overlapping periods and puts the newest overlap on top (lane 0)", () => {
    const { lanes, laneCount } = stablePeriodLanes(periods, "2026-07-16");
    // australia doesn't overlap army, so it reuses the bottom row
    assert.equal(lanes.get("australia"), lanes.get("army"));
    assert.notEqual(lanes.get("relationship"), lanes.get("army"));
    assert.notEqual(lanes.get("kupapay"), lanes.get("relationship"));
    assert.equal(lanes.get("kupapay"), 0);
    assert.equal(laneCount, 3);
  });
});

describe("dedupeEvents", () => {
  it("collapses identical title+date+time rows keeping the earliest created", () => {
    const events = [
      ev({ id: "b", event_date: "2026-07-01", title: "הקמת Digital Scale", created_at: "2026-07-02T00:00:00Z" }),
      ev({ id: "a", event_date: "2026-07-01", title: "הקמת Digital Scale", created_at: "2026-07-01T00:00:00Z" }),
      ev({ id: "c", event_date: "2026-07-01", title: "הקמת Digital Scale", created_at: "2026-07-03T00:00:00Z" }),
      ev({ id: "d", event_date: "2026-06-30", title: "נחיתה באוסטרליה" }),
    ];
    const { events: kept, duplicates } = dedupeEvents(events);
    assert.equal(kept.length, 2);
    assert.ok(kept.some((e) => e.id === "a"));
    assert.equal(duplicates.get("a"), 3);
    assert.equal(duplicates.has("d"), false);
  });

  it("keeps events with same title but different dates separate", () => {
    const events = [
      ev({ id: "a", event_date: "2026-05-08", title: "גמילה" }),
      ev({ id: "b", event_date: "2026-06-08", title: "גמילה" }),
    ];
    assert.equal(dedupeEvents(events).events.length, 2);
  });

  it("returns events sorted by time ascending", () => {
    const events = [
      ev({ id: "late", event_date: "2026-07-08" }),
      ev({ id: "early", event_date: "2026-05-08" }),
    ];
    const { events: kept } = dedupeEvents(events);
    assert.deepEqual(kept.map((e) => e.id), ["early", "late"]);
  });
});

describe("clusterEvents", () => {
  const viewMin = toTime("2026-01-01");
  const viewMax = toTime("2027-01-01");

  it("groups markers closer than minGapPx and keeps far ones separate", () => {
    const events = dedupeEvents([
      ev({ id: "a", event_date: "2026-06-30" }),
      ev({ id: "b", event_date: "2026-07-01" }),
      ev({ id: "c", event_date: "2026-07-02" }),
      ev({ id: "far", event_date: "2026-11-01" }),
    ]).events;
    const clusters = clusterEvents(events, viewMin, viewMax, 360, 44);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].events.length, 3);
    assert.equal(clusters[1].events.length, 1);
  });

  it("splits clusters apart when zoomed in", () => {
    const events = dedupeEvents([
      ev({ id: "a", event_date: "2026-06-30" }),
      ev({ id: "b", event_date: "2026-07-02" }),
    ]).events;
    const zoomedIn = clusterEvents(events, toTime("2026-06-28"), toTime("2026-07-05"), 360, 44);
    assert.equal(zoomedIn.length, 2);
  });

  it("cluster membership is independent of pan position at equal zoom", () => {
    const events = dedupeEvents([
      ev({ id: "a", event_date: "2026-06-30" }),
      ev({ id: "b", event_date: "2026-07-01" }),
    ]).events;
    const span = viewMax - viewMin;
    const panned = clusterEvents(events, viewMin - span / 3, viewMax - span / 3, 360, 44);
    const centered = clusterEvents(events, viewMin, viewMax, 360, 44);
    assert.equal(panned.length, centered.length);
    assert.deepEqual(
      panned.map((c) => c.events.map((e) => e.id)),
      centered.map((c) => c.events.map((e) => e.id))
    );
  });

  it("zoom target covers the full cluster range", () => {
    const events = dedupeEvents([
      ev({ id: "a", event_date: "2026-06-30" }),
      ev({ id: "b", event_date: "2026-07-02" }),
    ]).events;
    const [cluster] = clusterEvents(events, viewMin, viewMax, 360, 200);
    const target = clusterZoomTarget(cluster);
    assert.ok(target.min < eventDateTime(events[0]));
    assert.ok(target.max > eventDateTime(events[1]));
  });
});

describe("assignClusterLanes", () => {
  it("stacks close clusters into separate lanes", () => {
    const clusters = [
      { key: "a", x: 100, timeMin: 0, timeMax: 0, events: [] },
      { key: "b", x: 140, timeMin: 0, timeMax: 0, events: [] },
      { key: "c", x: 300, timeMin: 0, timeMax: 0, events: [] },
    ];
    const { lanes, laneCount } = assignClusterLanes(clusters, 96);
    assert.equal(lanes.get("a"), 0);
    assert.equal(lanes.get("b"), 1);
    assert.equal(lanes.get("c"), 0);
    assert.equal(laneCount, 2);
  });
});

describe("clampSpanX", () => {
  it("clamps huge spans to the padded window without losing on-screen accuracy", () => {
    const span = clampSpanX(-2_000_000, 3_000_000, 400);
    assert.ok(span);
    assert.equal(span!.left, -400);
    assert.equal(span!.left + span!.width, 800);
    assert.equal(span!.clippedStart, true);
    assert.equal(span!.clippedEnd, true);
  });

  it("returns null for spans entirely outside the window", () => {
    assert.equal(clampSpanX(5000, 9000, 400), null);
    assert.equal(clampSpanX(-9000, -5000, 400), null);
  });

  it("keeps small on-screen spans untouched", () => {
    const span = clampSpanX(50, 120, 400);
    assert.deepEqual(span, { left: 50, width: 70, clippedStart: false, clippedEnd: false });
  });
});

describe("visibleLabelSegment", () => {
  it("pins the label to the on-screen slice of a bar that overflows the viewport", () => {
    const seg = visibleLabelSegment(-1000, 2000, 400);
    assert.ok(seg);
    assert.equal(seg!.left, 8);
    assert.equal(seg!.left + seg!.width, 392);
  });

  it("hides the label when the visible slice is too narrow", () => {
    assert.equal(visibleLabelSegment(380, 420, 400), null);
  });

  it("keeps the label inside a fully visible bar", () => {
    const seg = visibleLabelSegment(100, 300, 400);
    assert.ok(seg);
    assert.equal(seg!.left, 108);
    assert.equal(seg!.left + seg!.width, 292);
  });
});
