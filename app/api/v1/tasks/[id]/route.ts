import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "done"];

type Params = { params: Promise<{ id: string }> };

function revalidateTaskPaths() {
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/");
}

/** Partial update: only fields present in the body are written. */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  if (!id) return badRequest("id_required");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("title" in body) {
    const title = str(body.title);
    if (!title) return badRequest("title_required");
    patch.title = title;
  }
  if ("project_id" in body) {
    const project_id = str(body.project_id);
    if (!project_id) return badRequest("project_required");
    patch.project_id = project_id;
  }
  if ("priority" in body && (PRIORITIES as string[]).includes(str(body.priority))) {
    patch.priority = str(body.priority);
  }
  if ("status" in body && (STATUSES as string[]).includes(str(body.status))) {
    patch.status = str(body.status);
  }
  if ("due_date" in body) patch.due_date = optStr(body.due_date);
  if ("notes" in body) patch.notes = optStr(body.notes);

  const { data, error } = await getSupabase().from("tasks").update(patch).eq("id", id).select().single();
  if (error) return dbError();
  revalidateTaskPaths();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");
  const { error } = await getSupabase().from("tasks").delete().eq("id", id);
  if (error) return dbError();
  revalidateTaskPaths();
  return NextResponse.json({ ok: true });
}
