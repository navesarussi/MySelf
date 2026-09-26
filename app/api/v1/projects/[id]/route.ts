import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import { canDeleteProject } from "@/lib/projects/delete-guard";
import { badRequest, dbError, isApiAuthorized, readJson, str, unauthorized } from "@/lib/api/auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";

type Params = { params: Promise<{ id: string }> };

function revalidateProjectPaths() {
  for (const p of ["/projects", "/tasks", "/relationships", "/"]) revalidatePath(p);
}

export const PATCH = withRouteHandler(async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  const name = str(body.name);
  if (!id || !name) return badRequest("name_required");


  const db = await userDb();
  const { data: dupe } = await db
    .from("projects")
    .select("id")
    .eq("name", name)
    .neq("id", id)
    .maybeSingle();
  if (dupe) return badRequest("project_exists");

  const { data, error } = await db.from("projects").update({ name }).eq("id", id).select().single();
  if (error) return dbError();
  revalidateProjectPaths();
  return NextResponse.json(data);
});

export const DELETE = withRouteHandler(async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");


  const db = await userDb();
  const [{ count: taskCount }, { count: relCount }] = await Promise.all([
    db.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", id),
    db.from("relationships").select("*", { count: "exact", head: true }).eq("project_id", id),
  ]);

  if (canDeleteProject(taskCount ?? 0, relCount ?? 0) === "blocked") {
    return badRequest("project_delete_blocked");
  }

  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) return dbError();
  revalidateProjectPaths();
  return NextResponse.json({ ok: true });
});
