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

export function habitActivityScore(habit: Habit, today = todayISO()): number {
  return (
    (habit.total_success_days ?? 0) +
    (habit.failure_count ?? 0) +
    effectiveStreak(habit, today) * 2 +
    (habit.best_streak ?? 0)
  );
}

/** Keep the most active record when duplicate habit names exist in the database. */
export function dedupeHabits(habits: Habit[], today = todayISO()): Habit[] {
  const byName = new Map<string, Habit>();
  for (const habit of habits) {
    const key = habit.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || habitActivityScore(habit, today) > habitActivityScore(existing, today)) {
      byName.set(key, habit);
    }
  }
  return Array.from(byName.values());
}

const HOME_HABIT_LIMIT = 8;

export function selectHomeHabits(habits: Habit[], today = todayISO()): Habit[] {
  return dedupeHabits(habits, today)
    .sort((a, b) => {
      const streakDiff = effectiveStreak(b, today) - effectiveStreak(a, today);
      if (streakDiff !== 0) return streakDiff;
      return habitActivityScore(b, today) - habitActivityScore(a, today);
    })
    .slice(0, HOME_HABIT_LIMIT);
}

export function computeFall(habit: Habit, today = todayISO()): CheckInResult {
  if (habit.last_checked_on === today) {
    return {
      streak: habit.streak_count,
      bestStreak: habit.best_streak,
      totalSuccessDays: habit.total_success_days,
      failureCount: habit.failure_count,
    };
  }

  return {
    streak: 0,
    bestStreak: habit.best_streak,
    totalSuccessDays: habit.total_success_days,
    failureCount: habit.failure_count + 1,
  };
}

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
