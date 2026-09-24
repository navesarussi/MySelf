import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { HabitReportOutcome } from "@/lib/habit-history";
import type { Habit } from "@/lib/types";

const MAX_MISSED_REPORT_DAYS = 14;

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

function reportTimeMinutes(reportTime?: string | null): number {
  const [h = 0, m = 0] = normalizeReportTime(reportTime).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** UTC instant when the reporting window for `day` opens. */
export function reportWindowOpensOn(day: string, reportTime?: string | null): Date {
  const [h, m] = normalizeReportTime(reportTime).split(":").map(Number);
  const d = parseISO(`${day}T00:00:00.000Z`);
  d.setUTCHours(h || 0, m || 0, 0, 0);
  return d;
}

/** UTC instant when the reporting window for `day` closes (next window opens). */
export function reportWindowEndOn(day: string, reportTime?: string | null): Date {
  const nextDay = format(addDays(parseISO(`${day}T00:00:00.000Z`), 1), "yyyy-MM-dd");
  return reportWindowOpensOn(nextDay, reportTime);
}

/** True once today's report_time has passed and the habit was not checked for the active day. */
export function isReportDue(habit: Habit, now = new Date()): boolean {
  const day = habitReportDay(habit.report_time, now);
  if (habit.last_checked_on === day) return false;
  const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutesNow >= reportTimeMinutes(habit.report_time);
}

/** Habits waiting on the active report day (includes the grace period before report_time). */
export function isAwaitingReport(habit: Habit, now = new Date()): boolean {
  const day = habitReportDay(habit.report_time, now);
  return habit.last_checked_on !== day;
}

/** True when closed reporting days still need chronological backfill. */
export function hasPendingBackfill(habit: Habit, now = new Date()): boolean {
  return missedReportDays(habit, now).length > 0;
}

/** Needs today's report and/or oldest-first backfill before the habit is "done". */
export function habitNeedsAction(habit: Habit, now = new Date()): boolean {
  return isAwaitingReport(habit, now) || hasPendingBackfill(habit, now);
}

/** Reported for the active day with no missed backfill windows. */
export function isFullyReportedForToday(habit: Habit, now = new Date()): boolean {
  return !habitNeedsAction(habit, now);
}

/**
 * Closed reporting days with no check-in, oldest first (chronological backfill order).
 * A day is eligible once its full window has ended.
 */
export function missedReportDays(
  habit: Habit,
  now = new Date(),
  maxDays = MAX_MISSED_REPORT_DAYS,
): string[] {
  const activeDay = habitReportDay(habit.report_time, now);
  const createdDay = habit.created_at?.slice(0, 10);
  const missed: string[] = [];
  let cursor = addDays(parseISO(`${activeDay}T00:00:00.000Z`), -1);

  while (missed.length < maxDays) {
    const day = format(cursor, "yyyy-MM-dd");
    if (createdDay && day < createdDay) break;
    if (habit.last_checked_on && day <= habit.last_checked_on) break;
    if (now.getTime() < reportWindowEndOn(day, habit.report_time).getTime()) break;
    missed.push(day);
    cursor = addDays(cursor, -1);
  }

  return missed.reverse();
}

export type HabitReportTarget =
  | { ok: true; day: string; isBackfill: boolean }
  | { ok: false; reason: "invalid_for_date" | "already_reported" };

/**
 * Which reporting day a report request may be written to.
 *
 * Backfill accepts any closed day from habit creation through yesterday
 * (strictly before the active reporting day). Duplicate days are rejected
 * later when the existing `habit_reports` row is checked.
 */
export function resolveHabitReportDay(
  habit: Habit,
  forDate: string | null | undefined,
  now = new Date(),
): HabitReportTarget {
  const activeDay = habitReportDay(habit.report_time, now);
  const requested = forDate?.trim();

  if (!requested) {
    if (habit.last_checked_on === activeDay) return { ok: false, reason: "already_reported" };
    return { ok: true, day: activeDay, isBackfill: false };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) return { ok: false, reason: "invalid_for_date" };
  if (requested >= activeDay) return { ok: false, reason: "invalid_for_date" };
  const createdDay = habit.created_at?.slice(0, 10);
  if (createdDay && requested < createdDay) return { ok: false, reason: "invalid_for_date" };
  if (now.getTime() < reportWindowEndOn(requested, habit.report_time).getTime()) {
    return { ok: false, reason: "invalid_for_date" };
  }
  return { ok: true, day: requested, isBackfill: true };
}

export type RecomputedHabitStats = {
  streak_count: number;
  best_streak: number;
  total_success_days: number;
  failure_count: number;
  last_checked_on: string | null;
};

/** Recompute aggregate habit stats from the full set of per-day reports. */
export function recomputeHabitStatsFromReports(
  habit: Habit,
  reports: Map<string, HabitReportOutcome>,
  now: Date = new Date(),
): RecomputedHabitStats {
  const activeDay = habitReportDay(habit.report_time, now);
  const createdDay = habit.created_at?.slice(0, 10) ?? activeDay;

  let totalSuccessDays = 0;
  let failureCount = 0;
  let lastCheckedOn: string | null = null;
  let lastCheckInDay: string | null = null;

  const sortedDates = [...reports.keys()].sort();
  for (const day of sortedDates) {
    const outcome = reports.get(day)!;
    if (outcome === "check_in") {
      if (lastCheckInDay) {
        const gap = differenceInCalendarDays(
          parseISO(`${day}T00:00:00.000Z`),
          parseISO(`${lastCheckInDay}T00:00:00.000Z`),
        );
        if (gap > 1) failureCount += 1;
      }
      totalSuccessDays += 1;
      lastCheckInDay = day;
      lastCheckedOn = day;
    } else {
      failureCount += 1;
      lastCheckedOn = day;
    }
  }

  const bestStreak = computeBestStreakFromReports(reports, createdDay, activeDay, habit, now);
  const streakCount = computeCurrentStreakFromReports(reports, activeDay, createdDay, habit, now);

  return {
    streak_count: streakCount,
    best_streak: Math.max(bestStreak, streakCount),
    total_success_days: totalSuccessDays,
    failure_count: failureCount,
    last_checked_on: lastCheckedOn,
  };
}

function computeBestStreakFromReports(
  reports: Map<string, HabitReportOutcome>,
  createdDay: string,
  activeDay: string,
  habit: Habit,
  now: Date,
): number {
  let best = 0;
  let running = 0;
  let cursor = parseISO(`${createdDay}T00:00:00.000Z`);
  const end = parseISO(`${activeDay}T00:00:00.000Z`);

  while (cursor <= end) {
    const day = format(cursor, "yyyy-MM-dd");
    const outcome = reports.get(day);
    if (outcome === "check_in") {
      running += 1;
      best = Math.max(best, running);
    } else if (outcome === "fall") {
      running = 0;
    } else if (
      day !== activeDay &&
      now.getTime() >= reportWindowEndOn(day, habit.report_time).getTime()
    ) {
      running = 0;
    }
    cursor = addDays(cursor, 1);
  }

  return best;
}

function computeCurrentStreakFromReports(
  reports: Map<string, HabitReportOutcome>,
  activeDay: string,
  createdDay: string,
  habit: Habit,
  now: Date,
): number {
  const checkIns = [...reports.entries()]
    .filter(([, outcome]) => outcome === "check_in")
    .map(([day]) => day)
    .sort();
  if (checkIns.length === 0) return 0;

  const lastCheckIn = checkIns[checkIns.length - 1]!;
  const gap = differenceInCalendarDays(
    parseISO(`${activeDay}T00:00:00.000Z`),
    parseISO(`${lastCheckIn}T00:00:00.000Z`),
  );
  if (gap > 1) return 0;

  let streak = 0;
  let cursor = parseISO(`${lastCheckIn}T00:00:00.000Z`);
  const created = parseISO(`${createdDay}T00:00:00.000Z`);

  while (cursor >= created) {
    const day = format(cursor, "yyyy-MM-dd");
    if (reports.get(day) === "check_in") {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else {
      break;
    }
  }

  return streak;
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
