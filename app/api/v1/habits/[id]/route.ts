import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { normalizeReportTime } from "@/lib/habit-stats";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

function revalidateHabitPaths() {
  revalidatePath("/habits");
  revalidatePath("/");
}

const num = (v: unknown) => Math.max(0, Number(v ?? 0) || 0);

/** Mirrors updateHabit: full edit of a habit, including manual stat fixes. */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const name = str(body.name);
  if (!id || !name) return badRequest("name_required");

  const streak_count = num(body.streak_count);
  const { data, error } = await getSupabase()
    .from("habits")
    .update({
      name,
      kind: str(body.kind) === "quit" ? "quit" : "build",
      target_note: optStr(body.target_note),
      streak_count,
      best_streak: Math.max(num(body.best_streak), streak_count),
      total_success_days: num(body.total_success_days),
      failure_count: num(body.failure_count),
      last_checked_on: optStr(body.last_checked_on),
      report_time: normalizeReportTime(str(body.report_time)),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidateHabitPaths();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");
  const { error } = await getSupabase().from("habits").delete().eq("id", id);
  if (error) return dbError();
  revalidateHabitPaths();
  return NextResponse.json({ ok: true });
}
