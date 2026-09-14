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
