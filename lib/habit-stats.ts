import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { HabitReportOutcome } from "@/lib/habit-history";
import {
  findJerusalemDayStart,
  jerusalemClock,
  jerusalemWallClockToDate,
  nextJerusalemDay,
  previousJerusalemDay,
} from "@/lib/push/time";
import type { Habit } from "@/lib/types";

const MAX_MISSED_REPORT_DAYS = 14;

/** Habits without an explicit report time are overdue from this Jerusalem hour. */
export const HABIT_IMPLICIT_OVERDUE_MINUTES = 23 * 60;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The habit's current reporting day (YYYY-MM-DD, Asia/Jerusalem). With an
 * explicit `report_time`, the window rolls at that wall-clock time; before it
 * the previous Jerusalem calendar day is still active. With the default
 * "00:00" (no explicit time), the window is the full Jerusalem calendar day.
 */
export function habitReportDay(reportTime?: string | null, now = new Date()): string {
  const { dayKey, minutes } = jerusalemClock(now);
  if (!hasExplicitReportTime(reportTime)) {
    return dayKey;
  }
  if (minutes < reportTimeMinutes(reportTime)) {
    return previousJerusalemDay(dayKey);
  }
  return dayKey;
}

/** True when the user set a non-default daily report time. */
export function hasExplicitReportTime(reportTime?: string | null): boolean {
  return normalizeReportTime(reportTime) !== "00:00";
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

/** UTC instant when the reporting window for Jerusalem calendar `day` opens. */
export function reportWindowOpensOn(day: string, reportTime?: string | null): Date {
  if (!hasExplicitReportTime(reportTime)) {
    return findJerusalemDayStart(day);
  }
  return jerusalemWallClockToDate(day, normalizeReportTime(reportTime));
}

/** UTC instant when the reporting window for `day` closes (next window opens). */
export function reportWindowEndOn(day: string, reportTime?: string | null): Date {
  if (!hasExplicitReportTime(reportTime)) {
    return findJerusalemDayStart(nextJerusalemDay(day));
  }
  return jerusalemWallClockToDate(nextJerusalemDay(day), normalizeReportTime(reportTime));
}

/**
 * True when the habit is overdue for its active reporting day: unchecked for
 * that day and past the configured Jerusalem report time. Habits without an
 * explicit report time (null / "00:00") become overdue from 23:00 Jerusalem
 * on the active day only — earlier they stay pending, not overdue.
 */
export function isReportDue(habit: Habit, now = new Date()): boolean {
  const day = habitReportDay(habit.report_time, now);
  if (habit.last_checked_on === day) return false;

  if (!hasExplicitReportTime(habit.report_time)) {
    const { dayKey, minutes } = jerusalemClock(now);
    if (dayKey !== day) {
      return now.getTime() >= reportWindowEndOn(day, habit.report_time).getTime();
    }
    return minutes >= HABIT_IMPLICIT_OVERDUE_MINUTES;
  }

  const { minutes } = jerusalemClock(now);
  return minutes >= reportTimeMinutes(habit.report_time);
}

/** Alias for overdue checks — same definition as {@link isReportDue}. */
export const isHabitOverdue = isReportDue;

export function filterOverdueHabits(habits: Habit[], now = new Date()): Habit[] {
  return habits.filter((habit) => isReportDue(habit, now));
}

export function countOverdueHabits(habits: Habit[], now = new Date()): number {
  return filterOverdueHabits(habits, now).length;
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

/** Minutes remaining until the habit's next report-window reset (Jerusalem). */
function minutesUntilReportReset(reportTime: string | null | undefined, now: Date): number {
  const threshold = hasExplicitReportTime(reportTime)
    ? reportTimeMinutes(reportTime)
    : HABIT_IMPLICIT_OVERDUE_MINUTES;
  const { minutes: minutesNow } = jerusalemClock(now);
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

/** Sort tier for habits listed for today (lower = higher in the list). */
export type HabitTodaySortTier = 0 | 1 | 2 | 3 | 4;

/**
 * 0 overdue today, 1 open today before report time (explicit time),
 * 2 open today with implicit time, 3 backfill-only, 4 fully reported.
 */
export function habitTodaySortTier(habit: Habit, now = new Date()): HabitTodaySortTier {
  if (!habitNeedsAction(habit, now)) return 4;
  if (isReportDue(habit, now)) return 0;
  if (isAwaitingReport(habit, now)) {
    return hasExplicitReportTime(habit.report_time) ? 1 : 2;
  }
  return 3;
}

function compareHabitNames(a: Habit, b: Habit): number {
  return a.name.localeCompare(b.name, "he");
}

/** Stable today-list ordering shared by home, habits tab, and legacy web. */
export function compareHabitsForToday(a: Habit, b: Habit, now = new Date()): number {
  const tierA = habitTodaySortTier(a, now);
  const tierB = habitTodaySortTier(b, now);
  if (tierA !== tierB) return tierA - tierB;

  if (tierA === 0 || tierA === 1) {
    const byTime = reportTimeMinutes(a.report_time) - reportTimeMinutes(b.report_time);
    if (byTime !== 0) return byTime;
  }

  return compareHabitNames(a, b);
}

/** Sort habits for today's lists: overdue → pending by time → implicit → backfill → done. */
export function sortHabitsForToday(habits: Habit[], now = new Date()): Habit[] {
  return [...habits].sort((a, b) => compareHabitsForToday(a, b, now));
}

/**
 * Habits page / home order: overdue first (earliest report time = longest overdue),
 * then open habits by next report time, implicit-time habits, backfill-only, then done.
 */
export function sortHabitsByReportUrgency(habits: Habit[], now = new Date()): Habit[] {
  return sortHabitsForToday(habits, now);
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
