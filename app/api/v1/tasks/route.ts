import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "done"];

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function revalidateTaskPaths() {
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/");
}

type TaskRow = Task & { projects: { name: string } | null };

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const project = sp.get("project");
  const status = sp.get("status");
  const priority = sp.get("priority");
  const source = sp.get("source");
  const externalList = sp.get("external_list");

  let q = getSupabase()
    .from("tasks")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });
  if (project) q = q.eq("project_id", project);
  if (status) {
    const list = status.split(",").filter((s): s is TaskStatus => (STATUSES as string[]).includes(s));
    if (list.length) q = q.in("status", list);
  }
  if (priority && (PRIORITIES as string[]).includes(priority)) q = q.eq("priority", priority);
  if (source) q = q.eq("source", source);
  if (externalList) q = q.eq("external_list_id", externalList);

  const { data, error } = await q;
  if (error) return dbError();
  const tasks = ((data as TaskRow[]) || []).map((row) => ({
    ...row,
    project_name: row.projects?.name,
    projects: undefined,
  }));
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const body = await readJson(req);
  const title = str(body.title);
  const project_id = str(body.project_id);
  if (!title) return badRequest("title_required");
  if (!project_id) return badRequest("project_required");

  const { data, error } = await getSupabase()
    .from("tasks")
    .insert({
      title,
      project_id,
      priority: pick(str(body.priority), PRIORITIES, "medium"),
      status: pick(str(body.status), STATUSES, "open"),
      due_date: optStr(body.due_date),
      notes: optStr(body.notes),
      source: "manual",
    })
    .select()
    .single();
  if (error) return dbError();
  revalidateTaskPaths();
  return NextResponse.json(data, { status: 201 });
}
