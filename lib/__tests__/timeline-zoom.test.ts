import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, HOUR_MS, YEAR_MS } from "../timeline-layout";
import {
  isEventVisibleAtZoom,
  parseMinZoom,
  spanToZoomLevel,
} from "../timeline-zoom";

describe("spanToZoomLevel", () => {
  it("classifies hour/day/month/year spans", () => {
    assert.equal(spanToZoomLevel(12 * HOUR_MS), "hours");
    assert.equal(spanToZoomLevel(10 * DAY_MS), "days");
    assert.equal(spanToZoomLevel(18 * 30 * DAY_MS), "months");
    assert.equal(spanToZoomLevel(10 * YEAR_MS), "years");
  });
});

describe("isEventVisibleAtZoom", () => {
  it("shows years-level events at every zoom", () => {
    assert.equal(isEventVisibleAtZoom("years", 10 * YEAR_MS), true);
    assert.equal(isEventVisibleAtZoom("years", 12 * HOUR_MS), true);
  });

  it("shows manual (months) events on the overview", () => {
    assert.equal(isEventVisibleAtZoom("months", 10 * YEAR_MS), true);
  });

  it("shows all-day (days) events from the month view", () => {
    assert.equal(isEventVisibleAtZoom("days", 10 * YEAR_MS), false);
    assert.equal(isEventVisibleAtZoom("days", 18 * 30 * DAY_MS), true);
    assert.equal(isEventVisibleAtZoom("days", 12 * HOUR_MS), true);
  });

  it("shows timed (hours) events from the day view, not the month view", () => {
    assert.equal(isEventVisibleAtZoom("hours", 18 * 30 * DAY_MS), false);
    assert.equal(isEventVisibleAtZoom("hours", 10 * DAY_MS), true);
    assert.equal(isEventVisibleAtZoom("hours", 12 * HOUR_MS), true);
  });

  it("defaults missing min_zoom to months", () => {
    assert.equal(isEventVisibleAtZoom(undefined, 10 * YEAR_MS), true);
    assert.equal(isEventVisibleAtZoom(null, 18 * 30 * DAY_MS), true);
  });
});

describe("parseMinZoom", () => {
  it("falls back to months for invalid values", () => {
    assert.equal(parseMinZoom("invalid"), "months");
    assert.equal(parseMinZoom(""), "months");
  });
});
