"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import { rememberLastProject } from "@/lib/last-project";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "done"];

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function revalidateTaskPaths() {
  revalidatePath("/legacy/tasks");
  revalidatePath("/legacy/projects");
  revalidatePath("/legacy");
}

export async function addTask(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const project_id = String(formData.get("project_id") || "").trim();
  if (!title) {
    await setFlash("flash.taskTitleRequired", "error");
    return;
  }
  if (!project_id) {
    await setFlash("flash.projectRequired", "error");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("tasks").insert({
    title,
    project_id,
    priority: pick(String(formData.get("priority") || ""), PRIORITIES, "medium"),
    status: pick(String(formData.get("status") || ""), STATUSES, "open"),
    due_date: String(formData.get("due_date") || "") || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });

  if (!error) await rememberLastProject("task", project_id);
  await setFlash(error ? "flash.taskAddError" : "flash.taskAdded", error ? "error" : "success");
  revalidateTaskPaths();
}

export async function updateTask(formData: FormData) {
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const project_id = String(formData.get("project_id") || "").trim();
  if (!id || !title) {
    await setFlash("flash.taskTitleRequired", "error");
    return;
  }
  if (!project_id) {
    await setFlash("flash.projectRequired", "error");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      project_id,
      priority: pick(String(formData.get("priority") || ""), PRIORITIES, "medium"),
      status: pick(String(formData.get("status") || ""), STATUSES, "open"),
      due_date: String(formData.get("due_date") || "") || null,
      notes: String(formData.get("notes") || "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await setFlash(error ? "flash.taskUpdateError" : "flash.taskUpdated", error ? "error" : "success");
  revalidateTaskPaths();
}

export async function updateTaskStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = pick(String(formData.get("status") || ""), STATUSES, "open");
  if (!id) return;

  const supabase = getSupabase();
  const { error } = await supabase
    .from("tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  await setFlash(error ? "flash.taskUpdateError" : "flash.taskUpdated", error ? "error" : "success");
  revalidateTaskPaths();
}

export async function deleteTask(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  await setFlash(error ? "flash.taskDeleteError" : "flash.taskDeleted", error ? "error" : "success");
  revalidateTaskPaths();
}
