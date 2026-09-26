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
  timelineTicks,
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

describe("toTime and tick placement are local-day accurate", () => {
  it("parses a bare date as local midnight, like the tick lines", () => {
    assert.equal(toTime("2026-09-26"), new Date(2026, 8, 26).getTime());
  });

  it("centers a year label inside its year, not on the Jan 1 line", () => {
    const min = new Date(2015, 0, 1).getTime();
    const max = new Date(2027, 0, 1).getTime();
    const ticks = timelineTicks(min, max, 400);
    const y2020 = ticks.find((t) => t.label === "2020")!;
    const jan1 = ((new Date(2020, 0, 1).getTime() - min) / (max - min)) * 400;
    const midYear = ((new Date(2020, 6, 2).getTime() - min) / (max - min)) * 400;
    assert.ok(Math.abs(y2020.x - jan1) < 0.5, "tick line on Jan 1");
    assert.ok(Math.abs(y2020.labelX - midYear) < 0.5, "label mid-year");
  });

  it("switches to month labels once a month name fits", () => {
    const min = new Date(2020, 0, 1).getTime();
    const max = new Date(2021, 6, 1).getTime();
    const labels = timelineTicks(min, max, 360, "en-US").map((t) => t.label);
    assert.ok(labels.includes("2021"), "January names the year");
    assert.ok(labels.some((l) => /^[A-Z][a-z]{2}$/.test(l)), `month names present: ${labels.join(",")}`);
  });

});

describe("month ticks at coarse steps", () => {
  it("align to January so the year label always appears", () => {
    const min = new Date(2019, 5, 10).getTime();
    const max = new Date(2025, 5, 10).getTime();
    const ticks = timelineTicks(min, max, 900, "en-US");
    const labels = ticks.map((t) => t.label);
    assert.ok(labels.includes("2021") && labels.includes("2022"), labels.join(","));
  });
});
