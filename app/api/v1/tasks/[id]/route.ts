import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized, notFound, projectWriteError } from "@/lib/api/auth";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { applyExternalStatusChange } from "@/lib/integrations/task-sources/writeback";
import { classifyWritebackError } from "@/lib/integrations/task-sources/writeback-errors";
import { attachTaskSource } from "@/lib/api/task-mutation";
import { TASK_SELECT, TaskJoin, projectNameFromJoin } from "@/lib/api/tasks";
import { withRouteHandler } from "@/lib/api/with-route-handler";

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "stuck", "review", "done"];

type Params = { params: Promise<{ id: string }> };

function revalidateTaskPaths() {
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/");
}

function safeRevalidateTaskPaths() {
  try {
    revalidateTaskPaths();
  } catch (err) {
    console.warn("[tasks] revalidate failed", err);
  }
}

/** Full row for one task — the list sends a truncated `notes` preview. */
export const GET = withRouteHandler(async function GET(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const { data, error } = await (await userDb())
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError();
  if (!data) return notFound();

  const row = data as unknown as TaskJoin;
  return NextResponse.json({
    ...row,
    project_name: projectNameFromJoin(row.projects),
    projects: undefined,
    notes_truncated: false,
  });
});

/** Partial update: only fields present in the body are written. */
export const PATCH = withRouteHandler(async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  const body = await readJson(req);
  if (!id) return badRequest("id_required");

  const { data: existingTask, error: fetchError } = await (await userDb())
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return dbError();
  if (!existingTask) return notFound();

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

  let localOnlyWarning: Record<string, unknown> | null = null;

  if (isExternal && "status" in body) {
    const nextStatus = str(body.status) as TaskStatus;
    try {
      await applyExternalStatusChange(task, nextStatus);
      patch.synced_at = new Date().toISOString();
    } catch (err) {
      const classified = classifyWritebackError(err);
      if (!classified.localOnlyAllowed) {
        return NextResponse.json(
          attachTaskSource({ error: classified.code, details: classified.message }, task.source),
          { status: 502 }
        );
      }
      localOnlyWarning = {
        local_only: true,
        warning: classified.code,
        source: task.source,
      };
    }
  }

  const { data, error } = await (await userDb()).from("tasks").update(patch).eq("id", id).select().single();
  if (error) return projectWriteError(error);
  safeRevalidateTaskPaths();
  return NextResponse.json(localOnlyWarning ? { ...data, ...localOnlyWarning } : data);
});

export const DELETE = withRouteHandler(async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const { data: existingTask, error: fetchError } = await (await userDb())
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return dbError();
  if (!existingTask) return notFound();

  const task = existingTask as Task;

  let localOnlyWarning: Record<string, unknown> | null = null;

  if (task.source !== "manual") {
    try {
      await applyExternalStatusChange(task, "done");
    } catch (err) {
      const classified = classifyWritebackError(err);
      if (!classified.localOnlyAllowed) {
        return NextResponse.json(
          attachTaskSource({ error: classified.code, details: classified.message }, task.source),
          { status: 502 }
        );
      }
      localOnlyWarning = {
        local_only: true,
        warning: classified.code,
        source: task.source,
      };
    }

    const now = new Date().toISOString();
    const { error } = await (await userDb())
      .from("tasks")
      .update({
        status: "done",
        synced_at: localOnlyWarning ? null : now,
        updated_at: now,
      })
      .eq("id", id);
    if (error) return dbError();
    safeRevalidateTaskPaths();
    return NextResponse.json({
      ok: true,
      completed: true,
      ...(localOnlyWarning ?? {}),
    });
  }

  const { error } = await (await userDb()).from("tasks").delete().eq("id", id);
  if (error) return dbError();
  safeRevalidateTaskPaths();
  return NextResponse.json({ ok: true });
});
