import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveHabitReportDay } from "../habit-stats";
import type { Habit } from "../types";

const base: Habit = {
  id: "1",
  name: "test",
  kind: "build",
  target_note: null,
  streak_count: 10,
  best_streak: 10,
  total_success_days: 10,
  failure_count: 0,
  last_checked_on: "2026-07-18",
  report_time: "00:00",
  archived: false,
  created_at: "2026-01-01T00:00:00.000Z",
};

/** 2026-07-22 12:00 UTC — active report day is 2026-07-22 for a 00:00 report time. */
const now = new Date("2026-07-22T12:00:00.000Z");

describe("resolveHabitReportDay", () => {
  it("resolves to the active report day when no for_date is given", () => {
    const r = resolveHabitReportDay(base, null, now);
    assert.deepEqual(r, { ok: true, day: "2026-07-22", isBackfill: false });
  });

  it("treats a repeat report for the active day as a no-op", () => {
    const r = resolveHabitReportDay({ ...base, last_checked_on: "2026-07-22" }, null, now);
    assert.deepEqual(r, { ok: false, reason: "already_reported" });
  });

  it("accepts a missed day between the last report and today", () => {
    const r = resolveHabitReportDay(base, "2026-07-19", now);
    assert.deepEqual(r, { ok: true, day: "2026-07-19", isBackfill: true });
  });

  // The bug: backfilling a day at or before last_checked_on rewinds the habit.
  // computeCheckIn then sees a negative gap, resets the streak to 1, adds a
  // failure, and last_checked_on moves backwards in time.
  it("rejects a for_date at or before the last report so the streak cannot rewind", () => {
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-18", now), {
      ok: false,
      reason: "invalid_for_date",
    });
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-17", now), {
      ok: false,
      reason: "invalid_for_date",
    });
  });

  it("rejects a for_date in the active day or the future", () => {
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-22", now), {
      ok: false,
      reason: "invalid_for_date",
    });
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-23", now), {
      ok: false,
      reason: "invalid_for_date",
    });
  });

  it("rejects a malformed for_date", () => {
    assert.deepEqual(resolveHabitReportDay(base, "19/07/2026", now), {
      ok: false,
      reason: "invalid_for_date",
    });
  });

  it("rejects a for_date before the habit existed", () => {
    const habit = { ...base, created_at: "2026-07-20T00:00:00.000Z", last_checked_on: null };
    assert.deepEqual(resolveHabitReportDay(habit, "2026-07-19", now), {
      ok: false,
      reason: "invalid_for_date",
    });
    assert.deepEqual(resolveHabitReportDay(habit, "2026-07-20", now), {
      ok: true,
      day: "2026-07-20",
      isBackfill: true,
    });
  });

  it("accepts any past day when the habit has never been reported", () => {
    const habit = { ...base, last_checked_on: null };
    assert.deepEqual(resolveHabitReportDay(habit, "2026-07-19", now), {
      ok: true,
      day: "2026-07-19",
      isBackfill: true,
    });
  });

  it("rejects a day whose report window has not closed yet", () => {
    // report_time 20:00 → the window for 2026-07-21 runs to 2026-07-22T20:00Z,
    // which is still open at 12:00Z, and the active day is still 2026-07-21.
    const habit = { ...base, report_time: "20:00", last_checked_on: "2026-07-18" };
    assert.deepEqual(resolveHabitReportDay(habit, "2026-07-21", now), {
      ok: false,
      reason: "invalid_for_date",
    });
    assert.deepEqual(resolveHabitReportDay(habit, "2026-07-20", now), {
      ok: true,
      day: "2026-07-20",
      isBackfill: true,
    });
  });

  it("keeps in-order backfill consistent with missedReportDays", () => {
    // Walking the offered missed days oldest-first must be accepted at each step.
    let habit: Habit = { ...base, last_checked_on: "2026-07-18", streak_count: 3 };
    for (const day of ["2026-07-19", "2026-07-20", "2026-07-21"]) {
      const r = resolveHabitReportDay(habit, day, now);
      assert.deepEqual(r, { ok: true, day, isBackfill: true });
      habit = { ...habit, last_checked_on: day };
    }
    // And the active day closes the sequence.
    assert.deepEqual(resolveHabitReportDay(habit, null, now), {
      ok: true,
      day: "2026-07-22",
      isBackfill: false,
    });
  });
});
