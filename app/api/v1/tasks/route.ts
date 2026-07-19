import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { badRequest, dbError, isApiAuthorized, optStr, readJson, str, unauthorized } from "@/lib/api/auth";
import { dedupeTasks } from "@/lib/data-integrity";
import { scheduleDataIntegrityCleanup } from "@/lib/schedule-data-integrity-cleanup";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "stuck", "review", "done"];
const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function revalidateTaskPaths() {
  revalidatePath("/tasks");
  revalidatePath("/projects");
  revalidatePath("/");
}

type TaskRow = Task & { projects: { name: string } | null };

function sortTasks(tasks: Task[], sort: string | null): Task[] {
  const list = [...tasks];
  if (sort === "due_date") {
    list.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    return list;
  }
  if (sort === "updated_at") {
    list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return list;
  }
  // default + priority: non-done first, then priority rank, then due
  list.sort((a, b) => {
    const aDone = a.status === "done" ? 1 : 0;
    const bDone = b.status === "done" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
  return list;
}

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const project = sp.get("project");
  const status = sp.get("status");
  const priority = sp.get("priority");
  const source = sp.get("source");
  const externalList = sp.get("external_list");
  const q = sp.get("q")?.trim();
  const overdue = sp.get("overdue") === "1";
  const sort = sp.get("sort");

  let query = getSupabase().from("tasks").select("*, projects(name)");
  if (project) query = query.eq("project_id", project);
  if (status) {
    const list = status.split(",").filter((s): s is TaskStatus => (STATUSES as string[]).includes(s));
    if (list.length) query = query.in("status", list);
  }
  if (priority) {
    const list = priority
      .split(",")
      .filter((p): p is TaskPriority => (PRIORITIES as string[]).includes(p));
    if (list.length === 1) query = query.eq("priority", list[0]);
    else if (list.length > 1) query = query.in("priority", list);
  }
  if (source) query = query.eq("source", source);
  if (externalList) query = query.eq("external_list_id", externalList);
  if (q) query = query.ilike("title", `%${q}%`);
  if (overdue) {
    const today = new Date().toISOString().slice(0, 10);
    query = query.lt("due_date", today).neq("status", "done");
  }

  const { data, error } = await query;
  if (error) return dbError();
  const tasks = dedupeTasks(
    ((data as TaskRow[]) || []).map((row) => ({
      ...row,
      project_name: row.projects?.name,
      projects: undefined,
    }))
  );
  const sorted = sortTasks(tasks, sort);
  const rawCount = (data as TaskRow[] | null)?.length ?? 0;
  scheduleDataIntegrityCleanup(sorted.length < rawCount);
  return NextResponse.json(sorted);
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
