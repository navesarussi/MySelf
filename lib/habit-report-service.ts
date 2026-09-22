import { getSupabase } from "@/lib/supabase";
import { computeCheckIn, computeFall, resolveHabitReportDay } from "@/lib/habit-stats";
import { upsertHabitReport } from "@/lib/habit-reports-store";
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
  const result = outcome === "check_in" ? computeCheckIn(habit, day) : computeFall(habit, day);

  const { data, error } = await getSupabase()
    .from("habits")
    .update({
      streak_count: result.streak,
      best_streak: result.bestStreak,
      total_success_days: result.totalSuccessDays,
      failure_count: result.failureCount,
      last_checked_on: day,
      last_reported_at: new Date().toISOString(),
    })
    .eq("id", habit.id)
    .select()
    .single();
  if (error || !data) return { ok: false, reason: "db_error" };

  // History row second: a habits row without its report row degrades the grid,
  // a report row without the habits row would claim a streak that never moved.
  await upsertHabitReport(habit.id, day, outcome);

  return { ok: true, habit: data as Habit, day, noop: false };
}

export async function loadHabit(id: string): Promise<Habit | null> {
  const { data } = await getSupabase().from("habits").select("*").eq("id", id).single<Habit>();
  return data ?? null;
}
