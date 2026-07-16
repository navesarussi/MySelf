"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import { canDeleteProject } from "@/lib/projects/delete-guard";

const PATHS = ["/legacy/projects", "/legacy/tasks", "/legacy/relationships", "/legacy"] as const;

function revalidateAll() {
  for (const p of PATHS) revalidatePath(p);
}

export async function addProject(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) {
    await setFlash("flash.projectNameRequired", "error");
    return;
  }

  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (existing) {
    await setFlash("flash.projectExists", "error");
    return;
  }

  const { data: maxRow } = await supabase
    .from("projects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (maxRow?.sort_order ?? 0) + 10;

  const { error } = await supabase.from("projects").insert({ name, sort_order });
  await setFlash(error ? "flash.genericError" : "flash.projectAdded", error ? "error" : "success");
  revalidateAll();
}

export async function renameProject(formData: FormData) {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!id || !name) {
    await setFlash("flash.projectNameRequired", "error");
    return;
  }

  const supabase = getSupabase();
  const { data: dupe } = await supabase
    .from("projects")
    .select("id")
    .eq("name", name)
    .neq("id", id)
    .maybeSingle();
  if (dupe) {
    await setFlash("flash.projectExists", "error");
    return;
  }

  const { error } = await supabase.from("projects").update({ name }).eq("id", id);
  await setFlash(error ? "flash.genericError" : "flash.projectUpdated", error ? "error" : "success");
  revalidateAll();
}

export async function deleteProject(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = getSupabase();
  const [{ count: taskCount }, { count: relCount }] = await Promise.all([
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("relationships").select("*", { count: "exact", head: true }).eq("project_id", id),
  ]);

  if (canDeleteProject(taskCount ?? 0, relCount ?? 0) === "blocked") {
    await setFlash("flash.projectDeleteBlocked", "error");
    return;
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);
  await setFlash(error ? "flash.genericError" : "flash.projectDeleted", error ? "error" : "success");
  revalidateAll();
}
