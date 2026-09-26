import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import { normalizeReportTime } from "@/lib/habit-stats";
import { badRequest, conflict, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import { dedupeHabits } from "@/lib/habit-stats";
import { isUniqueViolation } from "@/lib/data-integrity";
import { scheduleDataIntegrityCleanup } from "@/lib/schedule-data-integrity-cleanup";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function revalidateHabitPaths() {
  revalidatePath("/habits");
  revalidatePath("/");
}

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await (await userDb())
    .from("habits")
    .select(
      "id, name, kind, target_note, streak_count, best_streak, total_success_days, failure_count, last_checked_on, report_time, last_reported_at, archived, created_at"
    )
    .eq("archived", false)
    .order("created_at");
  if (error) return dbError();
  const rows = data || [];
  const unique = dedupeHabits(rows);
  scheduleDataIntegrityCleanup(unique.length < rows.length);
  return NextResponse.json(unique);
});

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const name = str(body.name);
  if (!name) return badRequest("name_required");
  const kind = str(body.kind) === "quit" ? "quit" : "build";

  const { data, error } = await (await userDb())
    .from("habits")
    .insert({
      name,
      kind,
      target_note: optStr(body.target_note),
      report_time: normalizeReportTime(str(body.report_time)),
    })
    .select()
    .single();
  if (error) return isUniqueViolation(error) ? conflict("habit_duplicate") : dbError();
  revalidateHabitPaths();
  return NextResponse.json(data, { status: 201 });
});
