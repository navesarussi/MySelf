import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHabitHistoryGrid } from "../habit-history";
import type { Habit } from "../types";

const habit: Habit = {
  id: "1",
  name: "no phone in bed",
  kind: "quit",
  target_note: "90 days",
  streak_count: 1,
  best_streak: 1,
  total_success_days: 1,
  failure_count: 15,
  last_checked_on: "2026-09-23",
  report_time: "00:00",
  archived: false,
  created_at: "2026-07-12T00:00:00.000Z",
};

const now = new Date("2026-09-24T12:00:00.000Z");

describe("buildHabitHistoryGrid backfill visibility", () => {
  it("marks closed days without a report as missed", () => {
    const grid = buildHabitHistoryGrid(habit, [], now, 35);
    const byDate = new Map(grid.map((day) => [day.date, day.status]));
    assert.equal(byDate.get("2026-09-10"), "missed");
    assert.equal(byDate.get("2026-09-11"), "missed");
  });

  it("removes a day from the missed list after it is reported", () => {
    const grid = buildHabitHistoryGrid(
      habit,
      [{ report_date: "2026-09-10", outcome: "check_in", reported_at: "2026-09-24T12:00:00.000Z" }],
      now,
      35,
    );
    const byDate = new Map(grid.map((day) => [day.date, day.status]));
    assert.equal(byDate.get("2026-09-10"), "success");
    assert.equal(byDate.get("2026-09-11"), "missed");
  });

  it("shows a retroactive fall in history", () => {
    const grid = buildHabitHistoryGrid(
      habit,
      [{ report_date: "2026-09-10", outcome: "fall", reported_at: "2026-09-24T12:00:00.000Z" }],
      now,
      35,
    );
    const byDate = new Map(grid.map((day) => [day.date, day.status]));
    assert.equal(byDate.get("2026-09-10"), "fall");
  });
});
