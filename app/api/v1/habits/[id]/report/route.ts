import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { computeCheckIn, computeFall, habitReportDay } from "@/lib/habit-stats";
import { badRequest, dbError, isApiAuthorized, notFound, readJson, str, unauthorized } from "@/lib/api/auth";
import type { Habit } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

function revalidateHabitPaths() {
  revalidatePath("/habits");
  revalidatePath("/");
}

/** Daily habit reporting — same rules as the web server actions.
 *  body.type: "check_in" | "fall" | "reset" */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const type = str(body.type);
  if (!id) return badRequest("id_required");

  const supabase = getSupabase();
  const { data: habit } = await supabase.from("habits").select("*").eq("id", id).single<Habit>();
  if (!habit) return notFound();

  if (type === "reset") {
    const hadStreak = habit.streak_count > 0;
    const { data, error } = await supabase
      .from("habits")
      .update({
        streak_count: 0,
        last_checked_on: null,
        failure_count: hadStreak ? habit.failure_count + 1 : habit.failure_count,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return dbError();
    revalidateHabitPaths();
    return NextResponse.json(data);
  }

  if (type !== "check_in" && type !== "fall") return badRequest("invalid_type");

  const today = habitReportDay(habit.report_time);
  if (habit.last_checked_on === today) {
    return NextResponse.json(habit); // already reported today — no-op, like the web
  }
  const result = type === "check_in" ? computeCheckIn(habit, today) : computeFall(habit, today);

  const { data, error } = await supabase
    .from("habits")
    .update({
      streak_count: result.streak,
      best_streak: result.bestStreak,
      total_success_days: result.totalSuccessDays,
      failure_count: result.failureCount,
      last_checked_on: today,
      last_reported_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidateHabitPaths();
  return NextResponse.json(data);
}
