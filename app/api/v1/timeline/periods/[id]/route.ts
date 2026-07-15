import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const title = str(body.title);
  const start_date = str(body.start_date);
  const end_date = optStr(body.end_date);
  if (!id || !title || !start_date) return badRequest("title_and_start_required");
  if (end_date && end_date < start_date) return badRequest("end_before_start");

  const { data, error } = await getSupabase()
    .from("life_periods")
    .update({
      title,
      start_date,
      end_date,
      color: str(body.color) || "#7dd3c0",
      kind: str(body.kind) || "period",
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidatePath("/timeline");
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");
  const { error } = await getSupabase().from("life_periods").delete().eq("id", id);
  if (error) return dbError();
  revalidatePath("/timeline");
  return NextResponse.json({ ok: true });
}
