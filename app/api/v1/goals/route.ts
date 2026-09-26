import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import { badRequest, conflict, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import { dedupeGoals, isUniqueViolation } from "@/lib/data-integrity";
import { scheduleDataIntegrityCleanup } from "@/lib/schedule-data-integrity-cleanup";
import { withRouteHandler } from "@/lib/api/with-route-handler";

function revalidateGoalPaths() {
  revalidatePath("/goals");
  revalidatePath("/");
}

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await (await userDb())
    .from("goals")
    .select("id, title, category, horizon, first_step, definition_of_done, status, sort_order, created_at")
    .order("sort_order");
  if (error) return dbError();
  const rows = data || [];
  const unique = dedupeGoals(rows);
  scheduleDataIntegrityCleanup(unique.length < rows.length);
  return NextResponse.json(unique);
});

export const POST = withRouteHandler(async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const title = str(body.title);
  if (!title) return badRequest("title_required");

  const { data, error } = await (await userDb())
    .from("goals")
    .insert({
      title,
      category: optStr(body.category),
      horizon: optStr(body.horizon),
      first_step: optStr(body.first_step),
      definition_of_done: optStr(body.definition_of_done),
    })
    .select()
    .single();
  if (error) return isUniqueViolation(error) ? conflict("goal_duplicate") : dbError();
  revalidateGoalPaths();
  return NextResponse.json(data, { status: 201 });
});
