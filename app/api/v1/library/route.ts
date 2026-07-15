import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";

const parseTags = (v: unknown) =>
  Array.isArray(v)
    ? v.map((t) => String(t).trim()).filter(Boolean)
    : str(v)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const category = (sp.get("category") || "").trim();

  let query = getSupabase()
    .from("content_entries")
    .select("id, title, category, body, tags, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (category) query = query.eq("category", category);
  if (q) {
    const pattern = `%${q}%`;
    query = query.or(`title.ilike.${pattern},body.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) return dbError();
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const title = str(body.title);
  const text = str(body.body);
  if (!title || !text) return badRequest("title_and_body_required");

  const { data, error } = await getSupabase()
    .from("content_entries")
    .insert({
      title,
      category: str(body.category) || "כללי",
      body: text,
      tags: parseTags(body.tags),
    })
    .select()
    .single();
  if (error) return dbError();
  revalidatePath("/library");
  return NextResponse.json(data, { status: 201 });
}
