import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { userDb } from "@/lib/db/user-db";
import {
  badRequest,
  dbError,
  isApiAuthorized,
  readJson,
  str,
  unauthorized,
  notFound,
  projectWriteError,
} from "@/lib/api/auth";
import type { Task } from "@/lib/types";
import { getTaskCapabilities } from "@/lib/integrations/task-sources/capabilities";
import { withRouteHandler } from "@/lib/api/with-route-handler";

type Params = { params: Promise<{ id: string }> };

function revalidateTaskPaths() {
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/");
}

export const POST = withRouteHandler(async function POST(req: NextRequest, { params }: Params) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { id } = await params;
  if (!id) return badRequest("id_required");

  const body = await readJson(req);
  const project_id = str(body.project_id);
  if (!project_id) return badRequest("project_required");

  const { data: existingTask, error: fetchError } = await (await userDb())
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return dbError();
  if (!existingTask) return notFound();

  const task = existingTask as Task;
  const caps = getTaskCapabilities(task);
  if (!caps.copyToManual.editable) {
    return NextResponse.json({ error: "copy_not_supported" }, { status: 400 });
  }

  const { data, error } = await (await userDb())
    .from("tasks")
    .insert({
      title: task.title,
      project_id,
      priority: task.priority,
      status: task.status === "done" ? "open" : task.status,
      due_date: task.due_date,
      notes: task.notes,
      source: "manual",
    })
    .select()
    .single();
  if (error) return projectWriteError(error);
  revalidateTaskPaths();
  return NextResponse.json(data, { status: 201 });
});
