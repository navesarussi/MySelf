import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

const parseTags = (v: unknown) =>
  Array.isArray(v)
    ? v.map((t) => String(t).trim()).filter(Boolean)
    : str(v)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const title = str(body.title);
  const text = str(body.body);
  if (!id || !title || !text) return badRequest("title_and_body_required");

  const { data, error } = await getSupabase()
    .from("content_entries")
    .update({
      title,
      category: str(body.category) || "כללי",
      body: text,
      tags: parseTags(body.tags),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError();
  revalidatePath("/library");
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");
  const { error } = await getSupabase().from("content_entries").delete().eq("id", id);
  if (error) return dbError();
  revalidatePath("/library");
  return NextResponse.json({ ok: true });
}
