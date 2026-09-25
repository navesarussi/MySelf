import { addDays, format, parseISO } from "date-fns";
import { habitReportDay, reportWindowEndOn } from "@/lib/habit-stats";
import type { Habit } from "@/lib/types";

export type HabitReportOutcome = "check_in" | "fall";

export type HabitReportRow = {
  report_date: string;
  outcome: HabitReportOutcome;
  reported_at: string;
};

export type HabitHistoryDay = {
  date: string;
  status: "success" | "fall" | "missed" | "pending" | "future";
};

export type HabitHistoryPartition = {
  missed: HabitHistoryDay[];
  reported: HabitHistoryDay[];
  other: HabitHistoryDay[];
};

/** Split history into the backfill queue vs already-reported days. */
export function partitionHabitHistory(days: HabitHistoryDay[]): HabitHistoryPartition {
  const missed: HabitHistoryDay[] = [];
  const reported: HabitHistoryDay[] = [];
  const other: HabitHistoryDay[] = [];
  for (const day of days) {
    if (day.status === "missed") missed.push(day);
    else if (day.status === "success" || day.status === "fall") reported.push(day);
    else other.push(day);
  }
  return { missed, reported, other };
}

/** Optimistically drop a missed day from the actionable queue. */
export function removeMissedHistoryDay(days: HabitHistoryDay[], date: string): HabitHistoryDay[] {
  return days.filter((day) => day.date !== date);
}

/** Restore a missed day after a failed write (keeps date order). */
export function restoreMissedHistoryDay(
  days: HabitHistoryDay[],
  date: string,
): HabitHistoryDay[] {
  if (days.some((day) => day.date === date)) return days;
  const restored: HabitHistoryDay = { date, status: "missed" };
  const next = [...days, restored];
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next;
}

export function buildHabitHistoryGrid(
  habit: Habit,
  reports: HabitReportRow[],
  now = new Date(),
  days = 35
): HabitHistoryDay[] {
  const activeDay = habitReportDay(habit.report_time, now);
  const byDate = new Map(reports.map((r) => [r.report_date, r.outcome]));
  const createdDay = habit.created_at?.slice(0, 10);
  const grid: HabitHistoryDay[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = format(addDays(parseISO(`${activeDay}T00:00:00.000Z`), -i), "yyyy-MM-dd");
    if (createdDay && date < createdDay) continue;

    const outcome = byDate.get(date);
    if (outcome === "check_in") {
      grid.push({ date, status: "success" });
      continue;
    }
    if (outcome === "fall") {
      grid.push({ date, status: "fall" });
      continue;
    }
    if (date > activeDay) {
      grid.push({ date, status: "future" });
      continue;
    }
    if (date === activeDay) {
      grid.push({ date, status: "pending" });
      continue;
    }
    const closed = now.getTime() >= reportWindowEndOn(date, habit.report_time).getTime();
    grid.push({ date, status: closed ? "missed" : "pending" });
  }

  return grid;
}
