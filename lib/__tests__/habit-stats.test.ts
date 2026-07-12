import { describe, expect, it } from "vitest";
import { computeCheckIn, effectiveStreak } from "@/lib/habit-stats";
import type { Habit } from "@/lib/types";

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
    expect(effectiveStreak({ ...base, last_checked_on: "2026-07-12" }, "2026-07-12")).toBe(100);
  });

  it("returns streak when checked yesterday", () => {
    expect(effectiveStreak({ ...base, last_checked_on: "2026-07-11" }, "2026-07-12")).toBe(100);
  });

  it("returns 0 when gap is more than one day", () => {
    expect(effectiveStreak(base, "2026-07-12")).toBe(0);
  });
});

describe("computeCheckIn", () => {
  it("extends streak on consecutive day", () => {
    const r = computeCheckIn({ ...base, last_checked_on: "2026-07-11", streak_count: 5 }, "2026-07-12");
    expect(r.streak).toBe(6);
    expect(r.totalSuccessDays).toBe(101);
    expect(r.failureCount).toBe(0);
  });

  it("records failure and resets streak after a missed day", () => {
    const r = computeCheckIn(base, "2026-07-12");
    expect(r.streak).toBe(1);
    expect(r.bestStreak).toBe(100);
    expect(r.totalSuccessDays).toBe(101);
    expect(r.failureCount).toBe(1);
  });

  it("starts first check-in at streak 1", () => {
    const r = computeCheckIn({ ...base, streak_count: 0, best_streak: 0, total_success_days: 0, last_checked_on: null }, "2026-07-12");
    expect(r.streak).toBe(1);
    expect(r.totalSuccessDays).toBe(1);
  });
});
