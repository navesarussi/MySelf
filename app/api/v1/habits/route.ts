import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { normalizeReportTime } from "@/lib/habit-stats";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";

function revalidateHabitPaths() {
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await getSupabase()
    .from("habits")
    .select("*")
    .eq("archived", false)
    .order("created_at");
  if (error) return dbError();
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const name = str(body.name);
  if (!name) return badRequest("name_required");
  const kind = str(body.kind) === "quit" ? "quit" : "build";

  const { data, error } = await getSupabase()
    .from("habits")
    .insert({
      name,
      kind,
      target_note: optStr(body.target_note),
      report_time: normalizeReportTime(str(body.report_time)),
    })
    .select()
    .single();
  if (error) return dbError();
  revalidateHabitPaths();
  return NextResponse.json(data, { status: 201 });
}
