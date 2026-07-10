"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";

export async function addTimelineEvent(formData: FormData) {
  const event_date = String(formData.get("event_date") || "");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "").trim();

  if (!event_date || !title) return;

  const supabase = getSupabase();
  await supabase.from("timeline_events").insert({
    event_date,
    title,
    description: description || null,
    category: category || null,
  });

  revalidatePath("/timeline");
}

export async function deleteTimelineEvent(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("timeline_events").delete().eq("id", id);
  revalidatePath("/timeline");
}
