"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import { normalizePhone } from "@/lib/integrations/phone";

const todayISO = () => new Date().toISOString().slice(0, 10);

function revalidateRelationshipPaths() {
  revalidatePath("/relationships");
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function addRelationship(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const group_name = String(formData.get("group_name") || "").trim();
  const reminder_days = String(formData.get("reminder_days") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const phoneRaw = String(formData.get("phone") || "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const project_id = String(formData.get("project_id") || "").trim();
  if (!name) return;
  if (!project_id) {
    await setFlash("flash.projectRequired", "error");
    return;
  }

  const supabase = getSupabase();
  await supabase.from("relationships").insert({
    name,
    group_name: group_name || null,
    reminder_days: reminder_days ? Number(reminder_days) : null,
    notes: notes || null,
    phone,
    project_id,
  });
  await setFlash("flash.relationshipAdded");
  revalidateRelationshipPaths();
}

export async function markContactedToday(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("relationships").update({ last_contact_date: todayISO() }).eq("id", id);
  await setFlash("flash.contactUpdated");
  revalidateRelationshipPaths();
}

export async function updateRelationship(formData: FormData) {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const group_name = String(formData.get("group_name") || "").trim();
  const reminder_days = String(formData.get("reminder_days") || "").trim();
  const phoneRaw = String(formData.get("phone") || "").trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const project_id = String(formData.get("project_id") || "").trim();
  if (!id || !name) return;
  if (!project_id) {
    await setFlash("flash.projectRequired", "error");
    return;
  }

  const supabase = getSupabase();
  await supabase
    .from("relationships")
    .update({
      name,
      group_name: group_name || null,
      reminder_days: reminder_days ? Number(reminder_days) : null,
      phone,
      project_id,
    })
    .eq("id", id);
  await setFlash("flash.relationshipUpdated");
  revalidateRelationshipPaths();
}

export async function updateRelationshipNotes(formData: FormData) {
  const id = String(formData.get("id") || "");
  const notes = String(formData.get("notes") || "").trim();
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("relationships").update({ notes: notes || null }).eq("id", id);
  await setFlash("flash.notesUpdated");
  revalidateRelationshipPaths();
}

export async function deleteRelationship(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("relationships").delete().eq("id", id);
  await setFlash("flash.relationshipDeleted");
  revalidateRelationshipPaths();
}
