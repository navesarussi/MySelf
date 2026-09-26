import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeCheckIn,
  computeFall,
  countOverdueHabits,
  dedupeHabits,
  effectiveStreak,
  filterOverdueHabits,
  habitNeedsAction,
  habitReportDay,
  hasExplicitReportTime,
  isAwaitingReport,
  isFullyReportedForToday,
  isReportDue,
  missedReportDays,
  normalizeReportTime,
  sortHabitsByOldestReport,
  sortHabitsByReportUrgency,
} from "../habit-stats";
import type { Habit } from "../types";

const base: Habit = {
  id: "1",
  name: "test",
  kind: "build",
  target_note: null,
  streak_count: 100,
  best_streak: 100,
  total_success_days: 100,
  failure_count: 0,
  last_checked_on: "2026-07-10",
  archived: false,
  created_at: "",
};

describe("effectiveStreak", () => {
  it("returns streak when checked today", () => {
    assert.equal(effectiveStreak({ ...base, last_checked_on: "2026-07-12" }, "2026-07-12"), 100);
  });

  it("returns streak when checked yesterday", () => {
    assert.equal(effectiveStreak({ ...base, last_checked_on: "2026-07-11" }, "2026-07-12"), 100);
  });

  it("returns 0 when gap is more than one day", () => {
    assert.equal(effectiveStreak(base, "2026-07-12"), 0);
  });
});

describe("computeCheckIn", () => {
  it("extends streak on consecutive day", () => {
    const r = computeCheckIn({ ...base, last_checked_on: "2026-07-11", streak_count: 5 }, "2026-07-12");
    assert.equal(r.streak, 6);
    assert.equal(r.totalSuccessDays, 101);
    assert.equal(r.failureCount, 0);
  });

  it("records failure and resets streak after a missed day", () => {
    const r = computeCheckIn(base, "2026-07-12");
    assert.equal(r.streak, 1);
    assert.equal(r.bestStreak, 100);
    assert.equal(r.totalSuccessDays, 101);
    assert.equal(r.failureCount, 1);
  });

  it("starts first check-in at streak 1", () => {
    const r = computeCheckIn(
      { ...base, streak_count: 0, best_streak: 0, total_success_days: 0, last_checked_on: null },
      "2026-07-12",
    );
    assert.equal(r.streak, 1);
    assert.equal(r.totalSuccessDays, 1);
  });
});

describe("computeFall", () => {
  it("increments failures and resets streak", () => {
    const r = computeFall({ ...base, streak_count: 14, failure_count: 30 }, "2026-07-12");
    assert.equal(r.streak, 0);
    assert.equal(r.failureCount, 31);
    assert.equal(r.totalSuccessDays, 100);
    assert.equal(r.bestStreak, 100);
  });

  it("is idempotent when already reported today", () => {
    const habit = { ...base, last_checked_on: "2026-07-12", failure_count: 5, streak_count: 0 };
    const r = computeFall(habit, "2026-07-12");
    assert.equal(r.failureCount, 5);
    assert.equal(r.streak, 0);
  });
});

describe("hasExplicitReportTime", () => {
  it("treats null and 00:00 as implicit end-of-day", () => {
    assert.equal(hasExplicitReportTime(null), false);
    assert.equal(hasExplicitReportTime("00:00"), false);
    assert.equal(hasExplicitReportTime("00:00:00"), false);
  });

  it("treats non-midnight times as explicit", () => {
    assert.equal(hasExplicitReportTime("18:00"), true);
    assert.equal(hasExplicitReportTime("06:30:00"), true);
  });
});

describe("habitReportDay", () => {
  it("defaults to the current Jerusalem day for implicit report time", () => {
    // 00:30 UTC = 03:30 Jerusalem (July, IDT)
    assert.equal(habitReportDay("00:00", new Date("2026-07-12T00:30:00Z")), "2026-07-12");
    assert.equal(habitReportDay(null, new Date("2026-07-12T20:59:00Z")), "2026-07-12");
  });

  it("keeps the previous Jerusalem day before the report time", () => {
    // 05:00 UTC = 08:00 Jerusalem, before 09:00 report time
    assert.equal(habitReportDay("09:00", new Date("2026-07-12T05:00:00Z")), "2026-07-11");
  });

  it("rolls to the new day once the Jerusalem report time passes", () => {
    // 06:00 UTC = 09:00 Jerusalem
    assert.equal(habitReportDay("09:00", new Date("2026-07-12T06:00:00Z")), "2026-07-12");
  });
});

describe("normalizeReportTime", () => {
  it("trims seconds and falls back to 00:00", () => {
    assert.equal(normalizeReportTime("06:30:00"), "06:30");
    assert.equal(normalizeReportTime(null), "00:00");
    assert.equal(normalizeReportTime("garbage"), "00:00");
  });
});

describe("sortHabitsByReportUrgency", () => {
  // 10:00 UTC = 13:00 Jerusalem on 2026-07-13 (IDT)
  const now = new Date("2026-07-13T10:00:00Z");

  it("puts unreported habits before already-reported ones", () => {
    const reported = { ...base, id: "reported", last_checked_on: "2026-07-13", report_time: "00:00" };
    const unreported = { ...base, id: "unreported", last_checked_on: "2026-07-12", report_time: "00:00" };
    const sorted = sortHabitsByReportUrgency([reported, unreported], now);
    assert.deepEqual(sorted.map((h) => h.id), ["unreported", "reported"]);
  });

  it("orders unreported habits by soonest report-window reset first", () => {
    const soon = { ...base, id: "soon", last_checked_on: "2026-07-11", report_time: "14:00" }; // resets in 1h
    const later = { ...base, id: "later", last_checked_on: "2026-07-11", report_time: "23:00" }; // resets in 10h
    const sorted = sortHabitsByReportUrgency([later, soon], now);
    assert.deepEqual(sorted.map((h) => h.id), ["soon", "later"]);
  });

  it("keeps already-reported habits in their original order", () => {
    const a = { ...base, id: "a", last_checked_on: "2026-07-13" };
    const b = { ...base, id: "b", last_checked_on: "2026-07-13" };
    const sorted = sortHabitsByReportUrgency([a, b], now);
    assert.deepEqual(sorted.map((h) => h.id), ["a", "b"]);
  });
});

describe("sortHabitsByOldestReport", () => {
  it("puts never-reported habits first, then oldest last report", () => {
    const never = { ...base, id: "never", last_checked_on: null, last_reported_at: null };
    const old = { ...base, id: "old", last_checked_on: "2026-07-01", last_reported_at: "2026-07-01T08:00:00Z" };
    const recent = {
      ...base,
      id: "recent",
      last_checked_on: "2026-07-12",
      last_reported_at: "2026-07-12T08:00:00Z",
    };
    const sorted = sortHabitsByOldestReport([recent, never, old]);
    assert.deepEqual(
      sorted.map((h) => h.id),
      ["never", "old", "recent"]
    );
  });
});

describe("isReportDue / overdue helpers", () => {
  it("is false before explicit report_time on the active Jerusalem day", () => {
    const habit = { ...base, last_checked_on: "2026-07-11", report_time: "18:00" };
    // 14:59 UTC = 17:59 Jerusalem — active report day is still 2026-07-12 until 18:00
    const now = new Date("2026-07-13T14:59:00Z");
    assert.equal(isReportDue(habit, now), false);
    assert.equal(isAwaitingReport(habit, now), true);
  });

  it("is true after explicit report_time when the active day is unchecked", () => {
    const habit = { ...base, last_checked_on: "2026-07-12", report_time: "18:00" };
    // 16:00 UTC = 19:00 Jerusalem on 2026-07-13
    assert.equal(isReportDue(habit, new Date("2026-07-13T16:00:00Z")), true);
  });

  it("is false when already checked for the active day", () => {
    const habit = { ...base, last_checked_on: "2026-07-13", report_time: "18:00" };
    assert.equal(isReportDue(habit, new Date("2026-07-13T16:00:00Z")), false);
  });

  it("does not count implicit report_time habits as overdue mid-day", () => {
    const habit = { ...base, last_checked_on: "2026-07-12", report_time: "00:00" };
    // 10:00 UTC = 13:00 Jerusalem
    assert.equal(isAwaitingReport(habit, new Date("2026-07-13T10:00:00Z")), true);
    assert.equal(isReportDue(habit, new Date("2026-07-13T10:00:00Z")), false);
  });

  it("counts implicit report_time habits overdue from 23:00 Jerusalem", () => {
    const habit = { ...base, last_checked_on: "2026-07-12", report_time: null };
    // 20:30 UTC = 23:30 Jerusalem on 2026-07-13
    assert.equal(isReportDue(habit, new Date("2026-07-13T20:30:00Z")), true);
  });

  it("filterOverdueHabits and countOverdueHabits match isReportDue", () => {
    const overdue = { ...base, id: "late", last_checked_on: "2026-07-12", report_time: "08:00" };
    const pending = { ...base, id: "open", last_checked_on: "2026-07-12", report_time: "21:00" };
    const done = { ...base, id: "done", last_checked_on: "2026-07-13", report_time: "08:00" };
    const now = new Date("2026-07-13T10:00:00Z"); // 13:00 Jerusalem
    const habits = [overdue, pending, done];
    assert.deepEqual(filterOverdueHabits(habits, now).map((h) => h.id), ["late"]);
    assert.equal(countOverdueHabits(habits, now), 1);
  });
});

describe("habitNeedsAction / isFullyReportedForToday", () => {
  const now = new Date("2026-07-13T10:00:00Z");

  it("needs action when today's report is missing", () => {
    const habit = { ...base, last_checked_on: "2026-07-12", report_time: "00:00" };
    assert.equal(habitNeedsAction(habit, now), true);
    assert.equal(isFullyReportedForToday(habit, now), false);
  });

  it("needs action when backfill is pending", () => {
    const habit = {
      ...base,
      created_at: "2026-06-01T00:00:00Z",
      last_checked_on: "2026-07-10",
      report_time: "00:00",
    };
    assert.equal(missedReportDays(habit, now).length > 0, true);
    assert.equal(habitNeedsAction(habit, now), true);
    assert.equal(isFullyReportedForToday(habit, now), false);
  });

  it("is fully reported when checked today with no backfill", () => {
    const habit = { ...base, last_checked_on: "2026-07-13", report_time: "00:00" };
    assert.equal(habitNeedsAction(habit, now), false);
    assert.equal(isFullyReportedForToday(habit, now), true);
  });
});

describe("missedReportDays", () => {
  it("lists closed days after the last check-in", () => {
    const habit = {
      ...base,
      created_at: "2026-06-01T00:00:00Z",
      last_checked_on: "2026-07-10",
      report_time: "00:00",
    };
    assert.deepEqual(missedReportDays(habit, new Date("2026-07-13T10:00:00Z")), [
      "2026-07-11",
      "2026-07-12",
    ]);
  });
});

describe("dedupeHabits", () => {
  it("keeps the record with more activity for duplicate names", () => {
    const active = { ...base, id: "active", name: "אימון יומי", total_success_days: 10, failure_count: 2 };
    const empty = {
      ...base,
      id: "empty",
      name: "אימון יומי",
      total_success_days: 0,
      failure_count: 0,
      streak_count: 0,
      best_streak: 0,
      last_checked_on: null,
    };
    assert.deepEqual(dedupeHabits([empty, active], "2026-07-12"), [active]);
  });
});
