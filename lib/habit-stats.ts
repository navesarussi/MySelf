import { differenceInCalendarDays } from "date-fns";
import type { Habit } from "@/lib/types";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Current streak — 0 if the habit was not checked in today or yesterday. */
export function effectiveStreak(habit: Habit, today = todayISO()): number {
  if (!habit.last_checked_on) return 0;
  const gap = differenceInCalendarDays(new Date(today), new Date(habit.last_checked_on));
  if (gap <= 1) return habit.streak_count;
  return 0;
}

export type CheckInResult = {
  streak: number;
  bestStreak: number;
  totalSuccessDays: number;
  failureCount: number;
};

export function computeCheckIn(habit: Habit, today = todayISO()): CheckInResult {
  if (habit.last_checked_on === today) {
    return {
      streak: habit.streak_count,
      bestStreak: habit.best_streak,
      totalSuccessDays: habit.total_success_days,
      failureCount: habit.failure_count,
    };
  }

  const gap = habit.last_checked_on
    ? differenceInCalendarDays(new Date(today), new Date(habit.last_checked_on))
    : null;

  let failures = habit.failure_count;
  let streak: number;

  if (gap === null) {
    streak = 1;
  } else if (gap === 1) {
    streak = habit.streak_count + 1;
  } else {
    streak = 1;
    failures += 1;
  }

  const totalSuccessDays = habit.total_success_days + 1;
  const bestStreak = Math.max(habit.best_streak, streak);

  return { streak, bestStreak, totalSuccessDays, failureCount: failures };
}
