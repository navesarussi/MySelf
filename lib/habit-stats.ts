import { differenceInCalendarDays } from "date-fns";
import type { Habit } from "@/lib/types";

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The habit's current reporting day (YYYY-MM-DD). A fresh reporting window
 * opens every day at `report_time` (default "00:00"); before that time the
 * previous day's window is still the active one. Computed on the UTC clock so
 * that server actions and the (client-rendered) card agree, matching the
 * app-wide UTC day handling used by todayISO().
 */
export function habitReportDay(reportTime?: string | null, now = new Date()): string {
  const [h = 0, m = 0] = (reportTime || "00:00").split(":").map(Number);
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const threshold = (h || 0) * 60 + (m || 0);
  const d = new Date(now);
  if (minutesNow < threshold) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Normalize a stored time ("HH:MM" or "HH:MM:SS") to an input-friendly "HH:MM". */
export function normalizeReportTime(reportTime?: string | null): string {
  const value = (reportTime || "00:00").slice(0, 5);
  return /^\d{2}:\d{2}$/.test(value) ? value : "00:00";
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

/** Minutes remaining until the habit's next report-window reset, on the UTC clock. */
function minutesUntilReportReset(reportTime: string | null | undefined, now: Date): number {
  const [h = 0, m = 0] = (reportTime || "00:00").split(":").map(Number);
  const threshold = (h || 0) * 60 + (m || 0);
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const minutes = (threshold - minutesNow + 1440) % 1440;
  return minutes === 0 ? 1440 : minutes;
}

/**
 * Habits page order: oldest last report first (never reported counts as oldest).
 * List reorders automatically after a new report when the caller refreshes data.
 */
export function sortHabitsByOldestReport(habits: Habit[]): Habit[] {
  return [...habits].sort((a, b) => {
    const aKey = a.last_reported_at || a.last_checked_on || "";
    const bKey = b.last_reported_at || b.last_checked_on || "";
    if (!aKey && !bKey) return 0;
    if (!aKey) return -1;
    if (!bKey) return 1;
    return aKey.localeCompare(bKey);
  });
}

/**
 * Habits page order: habits still waiting on today's report float to the top,
 * with the one closest to missing its report window (soonest reset) first.
 * Already-reported habits stay below, in their original order.
 */
export function sortHabitsByReportUrgency(habits: Habit[], now = new Date()): Habit[] {
  return habits
    .map((habit) => ({
      habit,
      reported: habit.last_checked_on === habitReportDay(habit.report_time, now),
      minutesUntilReset: minutesUntilReportReset(habit.report_time, now),
    }))
    .sort((a, b) => {
      if (a.reported !== b.reported) return a.reported ? 1 : -1;
      if (!a.reported) return a.minutesUntilReset - b.minutesUntilReset;
      return 0;
    })
    .map((entry) => entry.habit);
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

export function selectHomeHabits(
  habits: Habit[],
  today = todayISO(),
  limit: number | null = HOME_HABIT_LIMIT,
): Habit[] {
  const sorted = dedupeHabits(habits, today).sort((a, b) => {
    const streakDiff = effectiveStreak(b, today) - effectiveStreak(a, today);
    if (streakDiff !== 0) return streakDiff;
    return habitActivityScore(b, today) - habitActivityScore(a, today);
  });
  return limit == null ? sorted : sorted.slice(0, limit);
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
