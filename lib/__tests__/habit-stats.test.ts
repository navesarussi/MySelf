import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeCheckIn,
  computeFall,
  dedupeHabits,
  effectiveStreak,
  habitReportDay,
  normalizeReportTime,
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

describe("habitReportDay", () => {
  it("defaults to the current UTC day at report time 00:00", () => {
    assert.equal(habitReportDay("00:00", new Date("2026-07-12T00:30:00Z")), "2026-07-12");
    assert.equal(habitReportDay(null, new Date("2026-07-12T23:59:00Z")), "2026-07-12");
  });

  it("keeps the previous day before the report time", () => {
    assert.equal(habitReportDay("06:00", new Date("2026-07-12T05:00:00Z")), "2026-07-11");
  });

  it("rolls to the new day once the report time passes", () => {
    assert.equal(habitReportDay("06:00", new Date("2026-07-12T07:00:00Z")), "2026-07-12");
  });
});

describe("normalizeReportTime", () => {
  it("trims seconds and falls back to 00:00", () => {
    assert.equal(normalizeReportTime("06:30:00"), "06:30");
    assert.equal(normalizeReportTime(null), "00:00");
    assert.equal(normalizeReportTime("garbage"), "00:00");
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
