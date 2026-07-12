"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import { todayISO } from "@/lib/habit-stats";

export async function addGoal(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const horizon = String(formData.get("horizon") || "").trim();
  const first_step = String(formData.get("first_step") || "").trim();
  const definition_of_done = String(formData.get("definition_of_done") || "").trim();
  if (!title) return;

  const supabase = getSupabase();
  await supabase.from("goals").insert({
    title,
    category: category || null,
    horizon: horizon || null,
    first_step: first_step || null,
    definition_of_done: definition_of_done || null,
  });
  await setFlash("flash.goalAdded");
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function updateGoal(formData: FormData) {
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const horizon = String(formData.get("horizon") || "").trim();
  const first_step = String(formData.get("first_step") || "").trim();
  const definition_of_done = String(formData.get("definition_of_done") || "").trim();
  if (!id || !title) return;

  const supabase = getSupabase();
  await supabase
    .from("goals")
    .update({
      title,
      category: category || null,
      horizon: horizon || null,
      first_step: first_step || null,
      definition_of_done: definition_of_done || null,
    })
    .eq("id", id);
  await setFlash("flash.goalUpdated");
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function toggleGoalStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "active");
  if (!id) return;
  const supabase = getSupabase();
  await supabase
    .from("goals")
    .update({ status: status === "active" ? "done" : "active" })
    .eq("id", id);
  await setFlash("flash.goalUpdated");
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function deleteGoal(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("goals").delete().eq("id", id);
  await setFlash("flash.goalDeleted");
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function addCommitment(formData: FormData) {
  const text = String(formData.get("text") || "").trim();
  const commitment_date = String(formData.get("commitment_date") || todayISO());
  if (!text) return;
  const supabase = getSupabase();
  await supabase.from("commitments").insert({ text, commitment_date });
  await setFlash("flash.commitmentAdded");
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function setCommitmentStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "pending");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("commitments").update({ status }).eq("id", id);
  await setFlash("flash.commitmentUpdated");
  revalidatePath("/goals");
  revalidatePath("/");
}

export async function deleteCommitment(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("commitments").delete().eq("id", id);
  await setFlash("flash.commitmentDeleted");
  revalidatePath("/goals");
  revalidatePath("/");
}
