import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import {
  badRequest,
  dbError,
  isApiAuthorized,
  optStr,
  readJson,
  str,
  unauthorized,
  notFound,
  projectWriteError,
} from "@/lib/api/auth";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import {
  classifyWritebackError,
  MONDAY_DELETE_HIDDEN_MESSAGE_HE,
} from "@/lib/integrations/task-sources/writeback-errors";
import { attachTaskSource } from "@/lib/api/task-mutation";
import { TASK_SELECT, TaskJoin, projectNameFromJoin } from "@/lib/api/tasks";
import { withRouteHandler } from "@/lib/api/with-route-handler";
import { getTaskCapabilities } from "@/lib/integrations/task-sources/capabilities";
import {
  applyExternalTaskDelete,
  applyExternalTaskMove,
  applyExternalTaskPatch,
} from "@/lib/integrations/task-sources/external-update";

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

function writebackFailureResponse(task: Task, err: unknown) {
  const classified = classifyWritebackError(err);
  return NextResponse.json(
    attachTaskSource(
      {
        error: classified.code,
        details: classified.message,
        user_message_he: classified.userMessageHe,
        local_only_allowed: classified.localOnlyAllowed,
      },
      task.source
    ),
    { status: classified.localOnlyAllowed ? 409 : 502 }
  );
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
  const task = {
    ...row,
    project_name: projectNameFromJoin(row.projects),
    projects: undefined,
    notes_truncated: false,
  };
  return NextResponse.json({
    ...task,
    capabilities: getTaskCapabilities(task),
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
  const caps = getTaskCapabilities(task);
  const isExternal = task.source !== "manual";
  const forceLocal = body.force_local === true;

  if (body.hide_locally === true) {
    if (!caps.hideLocally.editable) {
      return NextResponse.json({ error: "field_readonly", field: "hide_locally" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const { data, error } = await (await userDb())
      .from("tasks")
      .update({ hidden_at: now, updated_at: now })
      .eq("id", id)
      .select()
      .single();
    if (error) return projectWriteError(error);
    safeRevalidateTaskPaths();
    return NextResponse.json({ ...data, hidden: true });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const externalPatch: Parameters<typeof applyExternalTaskPatch>[1] = {};

  if ("title" in body) {
    if (isExternal && !caps.title.editable) {
      return NextResponse.json(
        { error: "external_readonly", field: "title", reason_he: caps.title.reasonHe },
        { status: 400 }
      );
    }
    const title = str(body.title);
    if (!title) return badRequest("title_required");
    patch.title = title;
    externalPatch.title = title;
  }

  if ("project_id" in body) {
    if (isExternal) {
      return NextResponse.json({ error: "external_readonly", field: "project_id" }, { status: 400 });
    }
    const project_id = str(body.project_id);
    if (!project_id) return badRequest("project_required");
    patch.project_id = project_id;
  }

  if ("priority" in body && (PRIORITIES as string[]).includes(str(body.priority))) {
    patch.priority = str(body.priority);
    externalPatch.priority = str(body.priority) as TaskPriority;
  }

  if ("status" in body && (STATUSES as string[]).includes(str(body.status))) {
    patch.status = str(body.status);
    externalPatch.status = str(body.status) as TaskStatus;
  }

  if ("monday_status_index" in body && typeof body.monday_status_index === "number") {
    externalPatch.monday_status_index = body.monday_status_index;
    const labels = task.external_meta?.statusLabels ?? [];
    const picked = labels.find((l) => l.index === body.monday_status_index);
    if (picked?.is_done) patch.status = "done";
    else if (picked) patch.status = "open";
  }

  if ("due_date" in body) {
    if (isExternal && !caps.dueDate.editable) {
      return NextResponse.json(
        { error: "external_readonly", field: "due_date", reason_he: caps.dueDate.reasonHe },
        { status: 400 }
      );
    }
    patch.due_date = optStr(body.due_date);
    externalPatch.due_date = optStr(body.due_date);
  }

  if ("notes" in body) {
    if (isExternal && !caps.notes.editable) {
      return NextResponse.json(
        { error: "external_readonly", field: "notes", reason_he: caps.notes.reasonHe },
        { status: 400 }
      );
    }
    patch.notes = optStr(body.notes);
    externalPatch.notes = optStr(body.notes);
  }

  if ("external_list_id" in body && isExternal) {
    const nextList = str(body.external_list_id);
    if (!nextList) return badRequest("external_list_id_required");
    if (!caps.moveList.editable) {
      return NextResponse.json(
        { error: "external_readonly", field: "external_list_id", reason_he: caps.moveList.reasonHe },
        { status: 400 }
      );
    }
    try {
      await applyExternalTaskMove(task, nextList);
      patch.external_list_id = nextList;
      patch.synced_at = new Date().toISOString();
    } catch (err) {
      if (forceLocal) {
        patch.external_list_id = nextList;
      } else {
        return writebackFailureResponse(task, err);
      }
    }
  }

  let localOnlyWarning: Record<string, unknown> | null = null;

  if (isExternal && Object.keys(externalPatch).length > 0) {
    try {
      await applyExternalTaskPatch(task, externalPatch);
      patch.synced_at = new Date().toISOString();
    } catch (err) {
      const classified = classifyWritebackError(err);
      if (!classified.localOnlyAllowed && !forceLocal) {
        return writebackFailureResponse(task, err);
      }
      localOnlyWarning = {
        local_only: true,
        warning: classified.code,
        source: task.source,
        user_message_he: classified.userMessageHe,
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

  let forceLocal = false;
  let hideLocally = false;
  try {
    const url = new URL(req.url);
    forceLocal = url.searchParams.get("force_local") === "1";
    hideLocally = url.searchParams.get("hide_locally") === "1";
  } catch {
    /* no query */
  }

  const { data: existingTask, error: fetchError } = await (await userDb())
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return dbError();
  if (!existingTask) return notFound();

  const task = existingTask as Task;

  if (hideLocally) {
    const now = new Date().toISOString();
    const { error } = await (await userDb())
      .from("tasks")
      .update({ hidden_at: now, updated_at: now })
      .eq("id", id);
    if (error) return dbError();
    safeRevalidateTaskPaths();
    return NextResponse.json({ ok: true, hidden: true });
  }

  let localOnlyWarning: Record<string, unknown> | null = null;
  let hideAfterWritebackFailure = forceLocal;

  if (task.source !== "manual") {
    try {
      await applyExternalTaskDelete(task);
    } catch (err) {
      const classified = classifyWritebackError(err);
      if (!classified.localOnlyAllowed && !forceLocal) {
        return writebackFailureResponse(task, err);
      }
      hideAfterWritebackFailure = true;
      const userMessageHe =
        classified.code === "monday_permission_denied" ||
        classified.code === "external_permission_denied"
          ? MONDAY_DELETE_HIDDEN_MESSAGE_HE
          : classified.userMessageHe;
      localOnlyWarning = {
        local_only: true,
        warning: classified.code,
        source: task.source,
        user_message_he: userMessageHe,
        hidden: true,
      };
    }

    const now = new Date().toISOString();
    const { error } = await (await userDb())
      .from("tasks")
      .update({
        status: "done",
        hidden_at: hideAfterWritebackFailure ? now : null,
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
