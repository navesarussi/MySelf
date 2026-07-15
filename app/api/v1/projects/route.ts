import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";

function revalidateProjectPaths() {
  for (const p of ["/projects", "/tasks", "/relationships", "/"]) revalidatePath(p);
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { data, error } = await getSupabase().from("projects").select("*").order("sort_order");
  if (error) return dbError();
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const name = str(body.name);
  if (!name) return badRequest("name_required");

  const supabase = getSupabase();
  const { data: existing } = await supabase.from("projects").select("id").eq("name", name).maybeSingle();
  if (existing) return badRequest("project_exists");

  const { data: maxRow } = await supabase
    .from("projects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (maxRow?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from("projects")
    .insert({ name, sort_order })
    .select()
    .single();
  if (error) return dbError();
  revalidateProjectPaths();
  return NextResponse.json(data, { status: 201 });
}
