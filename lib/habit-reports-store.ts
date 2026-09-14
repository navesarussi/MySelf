import { getSupabase } from "@/lib/supabase";
import type { HabitReportOutcome, HabitReportRow } from "@/lib/habit-history";

export async function upsertHabitReport(
  habitId: string,
  reportDate: string,
  outcome: HabitReportOutcome
): Promise<void> {
  const { error } = await getSupabase()
    .from("habit_reports")
    .upsert(
      {
        habit_id: habitId,
        report_date: reportDate,
        outcome,
        reported_at: new Date().toISOString(),
      },
      { onConflict: "habit_id,report_date" }
    );
  if (error) throw new Error(error.message);
}

export async function loadHabitReports(habitId: string, days = 60): Promise<HabitReportRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceKey = since.toISOString().slice(0, 10);

  const { data, error } = await getSupabase()
    .from("habit_reports")
    .select("report_date, outcome, reported_at")
    .eq("habit_id", habitId)
    .gte("report_date", sinceKey)
    .order("report_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    report_date: String(row.report_date),
    outcome: row.outcome as HabitReportOutcome,
    reported_at: String(row.reported_at),
  }));
}
