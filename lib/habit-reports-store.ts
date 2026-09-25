import { userDb } from "@/lib/db/user-db";
import type { HabitReportOutcome, HabitReportRow } from "@/lib/habit-history";

export async function upsertHabitReport(
  habitId: string,
  reportDate: string,
  outcome: HabitReportOutcome
): Promise<void> {
  const { error } = await (await userDb())
    .from("habit_reports")
    .upsert(
      {
        habit_id: habitId,
        report_date: reportDate,
        outcome,
        reported_at: new Date().toISOString(),
      },
      { onConflict: "user_id,habit_id,report_date" }
    );
  if (error) throw new Error(error.message);
}

export async function loadHabitReportForDate(
  habitId: string,
  reportDate: string,
): Promise<HabitReportRow | null> {
  const { data, error } = await (await userDb())
    .from("habit_reports")
    .select("report_date, outcome, reported_at")
    .eq("habit_id", habitId)
    .eq("report_date", reportDate)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    report_date: String(data.report_date),
    outcome: data.outcome as HabitReportOutcome,
    reported_at: String(data.reported_at),
  };
}

export async function loadAllHabitReports(habitId: string): Promise<HabitReportRow[]> {
  const { data, error } = await (await userDb())
    .from("habit_reports")
    .select("report_date, outcome, reported_at")
    .eq("habit_id", habitId)
    .order("report_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    report_date: String(row.report_date),
    outcome: row.outcome as HabitReportOutcome,
    reported_at: String(row.reported_at),
  }));
}

export async function loadHabitReports(habitId: string, days = 60): Promise<HabitReportRow[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceKey = since.toISOString().slice(0, 10);

  const { data, error } = await (await userDb())
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
