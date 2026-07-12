import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignPeriodLanes,
  assignVisiblePeriodLanes,
  axisLineTop,
  invertPeriodLanes,
  lowestBarBottom,
  periodIntersectsView,
  TRACKS_PAD_TOP,
  tracksHeight,
  toTime,
} from "../timeline-layout";
import type { LifePeriod } from "../life-periods";

const LANE_GAP = 8;

function lowestBarBottomInPlot(lanes: Map<string, number>) {
  return TRACKS_PAD_TOP + lowestBarBottom(lanes);
}

describe("periodIntersectsView", () => {
  it("matches periods overlapping the viewport window", () => {
    const period = {
      id: "1",
      start_date: "2026-04-08",
      end_date: null,
    } as LifePeriod;
    const viewMin = toTime("2026-06-01");
    const viewMax = toTime("2026-07-01");
    assert.equal(periodIntersectsView(period, viewMin, viewMax), true);
    assert.equal(periodIntersectsView(period, toTime("2027-01-01"), toTime("2027-02-01")), false);
  });
});

describe("invertPeriodLanes", () => {
  it("puts the newest packed lane at the top", () => {
    const lanes = new Map([
      ["old", 0],
      ["mid", 1],
      ["new", 2],
    ]);
    const { lanes: inverted, laneCount } = invertPeriodLanes(lanes);
    assert.equal(laneCount, 3);
    assert.equal(inverted.get("new"), 0);
    assert.equal(inverted.get("mid"), 1);
    assert.equal(inverted.get("old"), 2);
  });
});

describe("assignVisiblePeriodLanes", () => {
  it("keeps the lowest bar above the axis clearance", () => {
    const viewMin = toTime("2026-05-01");
    const viewMax = toTime("2026-07-01");
    const periods = [
      { id: "7", title: "זוגיות", start_date: "2023-07-26", end_date: null },
      { id: "9", title: "אוסטרליה", start_date: "2026-04-08", end_date: null },
      { id: "10", title: "KupaPay", start_date: "2026-06-01", end_date: null },
    ] as LifePeriod[];

    const { lanes, laneCount } = assignVisiblePeriodLanes(periods, viewMin, viewMax);
    const tracksH = tracksHeight(laneCount);
    const axisTop = axisLineTop(tracksH);
    const lowestBottom = lowestBarBottomInPlot(lanes);

    assert.equal(lanes.get("10"), 0);
    assert.equal(lanes.get("9"), 1);
    assert.ok(lowestBottom + LANE_GAP <= axisTop);
  });

  it("ignores historical periods outside the viewport", () => {
    const viewMin = toTime("2026-05-01");
    const viewMax = toTime("2026-07-01");
    const periods = [
      { id: "1", title: "ילדות", start_date: "2002-01-02", end_date: "2021-12-22" },
      { id: "7", title: "זוגיות", start_date: "2023-07-26", end_date: null },
      { id: "9", title: "אוסטרליה", start_date: "2026-04-08", end_date: null },
    ] as LifePeriod[];

    const { lanes, laneCount } = assignVisiblePeriodLanes(periods, viewMin, viewMax);
    assert.equal(lanes.has("1"), false);
    assert.equal(laneCount, 2);
  });

  it("inverts greedy lanes for a wide viewport", () => {
    const periods = [
      { id: "7", title: "זוגיות", start_date: "2023-07-26", end_date: null },
      { id: "9", title: "אוסטרליה", start_date: "2026-04-08", end_date: null },
      { id: "10", title: "KupaPay", start_date: "2026-06-01", end_date: null },
    ] as LifePeriod[];
    const greedy = assignPeriodLanes(periods);
    const visible = assignVisiblePeriodLanes(periods, toTime("2000-01-01"), toTime("2030-01-01"));

    assert.equal(greedy.lanes.get("10"), 2);
    assert.equal(visible.lanes.get("10"), 0);
    assert.equal(visible.lanes.get("7"), 2);
  });

  it("clears year labels on a wide multi-period viewport", () => {
    const periods = [
      { id: "1", title: "ילדות", start_date: "2002-01-02", end_date: "2021-12-22" },
      { id: "4", title: "מכינה", start_date: "2020-08-01", end_date: "2021-10-01" },
      { id: "6", title: "צבא", start_date: "2021-12-23", end_date: "2025-04-19" },
      { id: "7", title: "זוגיות", start_date: "2023-07-26", end_date: null },
      { id: "9", title: "אוסטרליה", start_date: "2026-04-08", end_date: null },
      { id: "10", title: "KupaPay", start_date: "2026-06-01", end_date: null },
    ] as LifePeriod[];

    const { lanes, laneCount } = assignVisiblePeriodLanes(
      periods,
      toTime("2019-01-01"),
      toTime("2029-01-01")
    );
    const tracksH = tracksHeight(laneCount);
    const axisTop = axisLineTop(tracksH);
    const lowestBottom = TRACKS_PAD_TOP + lowestBarBottom(lanes);

    assert.ok(lowestBottom + LANE_GAP <= axisTop);
    assert.equal(lanes.has("4"), true);
  });
});
