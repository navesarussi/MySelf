import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import { applyHabitReport, loadHabit } from "@/lib/habit-report-service";
import { badRequest, dbError, isApiAuthorized, notFound, readJson, str, unauthorized } from "@/lib/api/auth";

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

  const habit = await loadHabit(id);
  if (!habit) return notFound();

  if (type === "reset") {
    const hadStreak = habit.streak_count > 0;
    const { data, error } = await (await userDb())
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

  const result = await applyHabitReport({ habit, outcome: type, forDate: str(body.for_date) || null });
  if (!result.ok) {
    return result.reason === "invalid_for_date" ? badRequest("invalid_for_date") : dbError();
  }
  if (!result.noop) revalidateHabitPaths();
  return NextResponse.json(result.habit);
}
