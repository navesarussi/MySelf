import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { canDeleteProject } from "@/lib/projects/delete-guard";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";

type Params = { params: Promise<{ id: string }> };

function revalidateProjectPaths() {
  for (const p of ["/projects", "/tasks", "/relationships", "/"]) revalidatePath(p);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const name = str(body.name);
  if (!id || !name) return badRequest("name_required");

  const supabase = getSupabase();
  const { data: dupe } = await supabase
    .from("projects")
    .select("id")
    .eq("name", name)
    .neq("id", id)
    .maybeSingle();
  if (dupe) return badRequest("project_exists");

  const { data, error } = await supabase.from("projects").update({ name }).eq("id", id).select().single();
  if (error) return dbError();
  revalidateProjectPaths();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const supabase = getSupabase();
  const [{ count: taskCount }, { count: relCount }] = await Promise.all([
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("relationships").select("*", { count: "exact", head: true }).eq("project_id", id),
  ]);

  if (canDeleteProject(taskCount ?? 0, relCount ?? 0) === "blocked") {
    return badRequest("project_delete_blocked");
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return dbError();
  revalidateProjectPaths();
  return NextResponse.json({ ok: true });
}
