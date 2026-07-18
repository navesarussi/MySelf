import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, conflict, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import { dedupeGoals, isUniqueViolation } from "@/lib/data-integrity";
import { scheduleDataIntegrityCleanup } from "@/lib/schedule-data-integrity-cleanup";

function revalidateGoalPaths() {
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await getSupabase().from("goals").select("*").order("sort_order");
  if (error) return dbError();
  const rows = data || [];
  const unique = dedupeGoals(rows);
  scheduleDataIntegrityCleanup(unique.length < rows.length);
  return NextResponse.json(unique);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const title = str(body.title);
  if (!title) return badRequest("title_required");

  const { data, error } = await getSupabase()
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
}
