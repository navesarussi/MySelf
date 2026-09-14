import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHabitHistoryGrid } from "../habit-history";
import type { Habit } from "../types";

const habit: Habit = {
  id: "h1",
  name: "Test",
  kind: "build",
  target_note: null,
  streak_count: 3,
  best_streak: 5,
  total_success_days: 10,
  failure_count: 1,
  last_checked_on: "2026-07-10",
  report_time: "00:00",
  archived: false,
  created_at: "2026-06-01T00:00:00Z",
};

describe("buildHabitHistoryGrid", () => {
  it("marks reported days as success or fall", () => {
    const grid = buildHabitHistoryGrid(
      habit,
      [
        { report_date: "2026-07-10", outcome: "check_in", reported_at: "2026-07-10T08:00:00Z" },
        { report_date: "2026-07-08", outcome: "fall", reported_at: "2026-07-08T08:00:00Z" },
      ],
      new Date("2026-07-12T12:00:00Z"),
      5
    );
    const byDate = new Map(grid.map((d) => [d.date, d.status]));
    assert.equal(byDate.get("2026-07-10"), "success");
    assert.equal(byDate.get("2026-07-08"), "fall");
    assert.equal(byDate.get("2026-07-11"), "missed");
  });
});
