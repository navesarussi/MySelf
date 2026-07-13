import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

const STATUSES = ["pending", "done", "missed"];

function revalidateCommitmentPaths() {
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const status = str(body.status);
  if (!id) return badRequest("id_required");
  if (!STATUSES.includes(status)) return badRequest("invalid_status");

  const { data, error } = await getSupabase()
    .from("commitments")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidateCommitmentPaths();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");
  const { error } = await getSupabase().from("commitments").delete().eq("id", id);
  if (error) return dbError();
  revalidateCommitmentPaths();
  return NextResponse.json({ ok: true });
}
