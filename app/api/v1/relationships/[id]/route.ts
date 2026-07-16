import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/integrations/phone";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

function revalidateRelationshipPaths() {
  revalidatePath("/relationships");
  revalidatePath("/projects");
  revalidatePath("/");
}

/** Partial update: only fields present in the body are written.
 *  Sending {last_contact_date: "YYYY-MM-DD"} implements "talked today". */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  if (!id) return badRequest("id_required");

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = str(body.name);
    if (!name) return badRequest("name_required");
    patch.name = name;
  }
  if ("project_id" in body) {
    const project_id = str(body.project_id);
    if (!project_id) return badRequest("project_required");
    patch.project_id = project_id;
  }
  if ("group_name" in body) patch.group_name = optStr(body.group_name);
  if ("reminder_days" in body) {
    patch.reminder_days =
      typeof body.reminder_days === "number" ? body.reminder_days : Number(str(body.reminder_days)) || null;
  }
  if ("phone" in body) {
    const phoneRaw = str(body.phone);
    patch.phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  }
  if ("email" in body) patch.email = optStr(body.email);
  if ("notes" in body) patch.notes = optStr(body.notes);
  if ("last_contact_date" in body) patch.last_contact_date = optStr(body.last_contact_date);
  if (Object.keys(patch).length === 0) return badRequest("empty_patch");

  const { data, error } = await getSupabase()
    .from("relationships")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidateRelationshipPaths();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");
  const { error } = await getSupabase().from("relationships").delete().eq("id", id);
  if (error) return dbError();
  revalidateRelationshipPaths();
  return NextResponse.json({ ok: true });
}
