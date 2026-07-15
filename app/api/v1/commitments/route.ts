import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { todayISO } from "@/lib/habit-stats";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";

function revalidateCommitmentPaths() {
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await getSupabase()
    .from("commitments")
    .select("*")
    .order("commitment_date", { ascending: false });
  if (error) return dbError();
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const text = str(body.text);
  if (!text) return badRequest("text_required");

  const { data, error } = await getSupabase()
    .from("commitments")
    .insert({ text, commitment_date: str(body.commitment_date) || todayISO() })
    .select()
    .single();
  if (error) return dbError();
  revalidateCommitmentPaths();
  return NextResponse.json(data, { status: 201 });
}
