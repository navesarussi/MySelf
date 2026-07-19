import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { applyExternalStatusChange } from "@/lib/integrations/task-sources/writeback";

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "stuck", "review", "done"];

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

  const { data: existingTask, error: fetchError } = await getSupabase()
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existingTask) return dbError();

  const task = existingTask as Task;
  const isExternal = task.source !== "manual";

  if (isExternal) {
    const readonly = ["title", "due_date", "notes", "project_id"];
    for (const field of readonly) {
      if (field in body) {
        return NextResponse.json({ error: "external_readonly", field }, { status: 400 });
      }
    }
  }

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

  if (isExternal && "status" in body) {
    const nextStatus = str(body.status) as TaskStatus;
    try {
      await applyExternalStatusChange(task, nextStatus);
      patch.synced_at = new Date().toISOString();
    } catch (err) {
      return NextResponse.json({ error: "external_write_failed", details: String(err) }, { status: 502 });
    }
  }

  const { data, error } = await getSupabase().from("tasks").update(patch).eq("id", id).select().single();
  if (error) return dbError();
  revalidateTaskPaths();
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const { data: existingTask, error: fetchError } = await getSupabase()
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchError || !existingTask) return dbError();

  const task = existingTask as Task;

  if (task.source !== "manual") {
    try {
      await applyExternalStatusChange(task, "done");
    } catch (err) {
      return NextResponse.json({ error: "external_write_failed", details: String(err) }, { status: 502 });
    }

    const now = new Date().toISOString();
    const { error } = await getSupabase()
      .from("tasks")
      .update({ status: "done", synced_at: now, updated_at: now })
      .eq("id", id);
    if (error) return dbError();
    revalidateTaskPaths();
    return NextResponse.json({ ok: true, completed: true });
  }

  const { error } = await getSupabase().from("tasks").delete().eq("id", id);
  if (error) return dbError();
  revalidateTaskPaths();
  return NextResponse.json({ ok: true });
}
