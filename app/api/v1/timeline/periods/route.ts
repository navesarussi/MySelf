import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await getSupabase()
    .from("life_periods")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return dbError();
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const title = str(body.title);
  const start_date = str(body.start_date);
  if (!title || !start_date) return badRequest("title_and_start_required");

  const { data, error } = await getSupabase()
    .from("life_periods")
    .insert({
      title,
      start_date,
      end_date: optStr(body.end_date),
      color: str(body.color) || "#7dd3c0",
      kind: "period",
      sort_order: 100,
    })
    .select()
    .single();
  if (error) return dbError();
  revalidatePath("/timeline");
  return NextResponse.json(data, { status: 201 });
}
