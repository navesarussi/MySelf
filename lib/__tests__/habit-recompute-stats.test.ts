import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recomputeHabitStatsFromReports } from "../habit-stats";
import type { HabitReportOutcome } from "../habit-history";
import type { Habit } from "../types";

const base: Habit = {
  id: "1",
  name: "test",
  kind: "quit",
  target_note: null,
  streak_count: 1,
  best_streak: 5,
  total_success_days: 1,
  failure_count: 15,
  last_checked_on: "2026-09-23",
  report_time: "00:00",
  archived: false,
  created_at: "2026-07-12T00:00:00.000Z",
};

const now = new Date("2026-09-24T12:00:00.000Z");

function reports(entries: [string, HabitReportOutcome][]): Map<string, HabitReportOutcome> {
  return new Map(entries);
}

describe("recomputeHabitStatsFromReports", () => {
  it("counts successes and explicit falls from all reports", () => {
    const stats = recomputeHabitStatsFromReports(
      base,
      reports([
        ["2026-09-23", "check_in"],
        ["2026-08-10", "fall"],
        ["2026-08-05", "check_in"],
      ]),
      now,
    );
    assert.equal(stats.total_success_days, 2);
    assert.equal(stats.failure_count, 2);
    assert.equal(stats.last_checked_on, "2026-09-23");
  });

  it("adds a gap failure when check-ins are not consecutive", () => {
    const stats = recomputeHabitStatsFromReports(
      base,
      reports([
        ["2026-08-01", "check_in"],
        ["2026-08-05", "check_in"],
      ]),
      now,
    );
    assert.equal(stats.total_success_days, 2);
    assert.equal(stats.failure_count, 1);
  });

  it("updates streak when retroactive success bridges to the latest check-in", () => {
    const stats = recomputeHabitStatsFromReports(
      base,
      reports([
        ["2026-09-22", "check_in"],
        ["2026-09-23", "check_in"],
      ]),
      now,
    );
    assert.equal(stats.streak_count, 2);
    assert.equal(stats.best_streak, 2);
  });

  it("returns zero streak when the latest check-in is more than one day ago", () => {
    const stats = recomputeHabitStatsFromReports(
      base,
      reports([["2026-09-22", "check_in"]]),
      now,
    );
    assert.equal(stats.streak_count, 0);
  });
});
