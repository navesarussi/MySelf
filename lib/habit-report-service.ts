import { userDb } from "@/lib/db/user-db";
import { recomputeHabitStatsFromReports, resolveHabitReportDay } from "@/lib/habit-stats";
import { loadAllHabitReports, loadHabitReportForDate, upsertHabitReport } from "@/lib/habit-reports-store";
import type { HabitReportOutcome } from "@/lib/habit-history";
import type { Habit } from "@/lib/types";

/**
 * The single write path for "I did / I did not do this habit today".
 *
 * There used to be three copies of this (REST route, agent tool, legacy server
 * action) and only the REST one wrote the `habit_reports` row, so a habit
 * reported through the agent or the legacy site showed up as *missed* in the
 * history grid. Reporting is one operation with one home; callers differ only
 * in how they load the habit and what they do with the result.
 */

export type HabitReportResult =
  | { ok: true; habit: Habit; day: string; noop: boolean }
  | { ok: false; reason: "invalid_for_date" | "not_found" | "db_error" };

export async function applyHabitReport(input: {
  habit: Habit;
  outcome: HabitReportOutcome;
  /** Backfill of a closed, unreported day. Omit for the active reporting day. */
  forDate?: string | null;
  now?: Date;
}): Promise<HabitReportResult> {
  const { habit, outcome } = input;
  const target = resolveHabitReportDay(habit, input.forDate, input.now ?? new Date());
  if (!target.ok) {
    // A repeat report for the day already recorded is the expected no-op the
    // UI relies on (double tap, retried request) — not an error.
    if (target.reason === "already_reported") {
      return { ok: true, habit, day: habit.last_checked_on!, noop: true };
    }
    return { ok: false, reason: "invalid_for_date" };
  }

  const day = target.day;

  const existing = await loadHabitReportForDate(habit.id, day);
  if (existing) return { ok: true, habit, day, noop: true };

  await upsertHabitReport(habit.id, day, outcome);

  const reports = await loadAllHabitReports(habit.id);
  const reportsMap = new Map(reports.map((row) => [row.report_date, row.outcome]));
  const stats = recomputeHabitStatsFromReports(habit, reportsMap, input.now ?? new Date());

  const { data, error } = await (await userDb())
    .from("habits")
    .update({
      streak_count: stats.streak_count,
      best_streak: stats.best_streak,
      total_success_days: stats.total_success_days,
      failure_count: stats.failure_count,
      last_checked_on: stats.last_checked_on,
      last_reported_at: new Date().toISOString(),
    })
    .eq("id", habit.id)
    .select()
    .single();
  if (error || !data) return { ok: false, reason: "db_error" };

  return { ok: true, habit: data as Habit, day, noop: false };
}

export async function loadHabit(id: string): Promise<Habit | null> {
  const { data } = await (await userDb()).from("habits").select("*").eq("id", id).single<Habit>();
  return data ?? null;
}
