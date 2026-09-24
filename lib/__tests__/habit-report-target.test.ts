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

  it("accepts retroactive backfill for a day at or before the last report", () => {
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-18", now), {
      ok: true,
      day: "2026-07-18",
      isBackfill: true,
    });
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-17", now), {
      ok: true,
      day: "2026-07-17",
      isBackfill: true,
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

  it("allows out-of-order backfill for any closed missed day", () => {
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-21", now), {
      ok: true,
      day: "2026-07-21",
      isBackfill: true,
    });
    assert.deepEqual(resolveHabitReportDay(base, "2026-07-19", now), {
      ok: true,
      day: "2026-07-19",
      isBackfill: true,
    });
  });
});
