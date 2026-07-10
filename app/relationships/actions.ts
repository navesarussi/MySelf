"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function addRelationship(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const group_name = String(formData.get("group_name") || "").trim();
  const reminder_days = String(formData.get("reminder_days") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  if (!name) return;

  const supabase = getSupabase();
  await supabase.from("relationships").insert({
    name,
    group_name: group_name || null,
    reminder_days: reminder_days ? Number(reminder_days) : null,
    notes: notes || null,
  });
  revalidatePath("/relationships");
}

export async function markContactedToday(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("relationships").update({ last_contact_date: todayISO() }).eq("id", id);
  revalidatePath("/relationships");
  revalidatePath("/");
}

export async function updateRelationshipNotes(formData: FormData) {
  const id = String(formData.get("id") || "");
  const notes = String(formData.get("notes") || "").trim();
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("relationships").update({ notes: notes || null }).eq("id", id);
  revalidatePath("/relationships");
}

export async function deleteRelationship(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("relationships").delete().eq("id", id);
  revalidatePath("/relationships");
}
