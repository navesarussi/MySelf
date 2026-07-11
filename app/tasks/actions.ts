"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import type { TaskPriority, TaskProject, TaskStatus } from "@/lib/types";

const PROJECTS: TaskProject[] = ["Digital Scale", "Glowy", "KupaPay", "אישי", "אחר"];
const PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "done"];

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export async function addTask(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  if (!title) {
    await setFlash("חסרה כותרת למשימה", "error");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("tasks").insert({
    title,
    project: pick(String(formData.get("project") || ""), PROJECTS, "אישי"),
    priority: pick(String(formData.get("priority") || ""), PRIORITIES, "medium"),
    status: pick(String(formData.get("status") || ""), STATUSES, "open"),
    due_date: String(formData.get("due_date") || "") || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });

  await setFlash(error ? "שגיאה בהוספת משימה" : "המשימה נוספה", error ? "error" : "success");
  revalidatePath("/tasks");
  revalidatePath("/");
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

  await setFlash(error ? "שגיאה בעדכון" : "המשימה עודכנה", error ? "error" : "success");
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function deleteTask(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  await setFlash(error ? "שגיאה במחיקה" : "המשימה נמחקה", error ? "error" : "success");
  revalidatePath("/tasks");
  revalidatePath("/");
}
