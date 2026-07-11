"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";

export async function addTimelineEvent(formData: FormData) {
  const event_date = String(formData.get("event_date") || "");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "").trim();

  if (!event_date || !title) {
    await setFlash("חסרים תאריך או כותרת", "error");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("timeline_events").insert({
    event_date,
    title,
    description: description || null,
    category: category || null,
  });

  await setFlash(error ? "שגיאה בהוספת אירוע" : "האירוע נוסף", error ? "error" : "success");
  revalidatePath("/timeline");
}

export async function deleteTimelineEvent(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  const { error } = await supabase.from("timeline_events").delete().eq("id", id);
  await setFlash(error ? "שגיאה במחיקה" : "האירוע נמחק", error ? "error" : "success");
  revalidatePath("/timeline");
}

export async function addLifePeriod(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const start_date = String(formData.get("start_date") || "");
  const end_date = String(formData.get("end_date") || "") || null;
  const color = String(formData.get("color") || "#7dd3c0");
  if (!title || !start_date) {
    await setFlash("חסרים שם או תאריך התחלה לתקופה", "error");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("life_periods").insert({
    title,
    start_date,
    end_date,
    color,
    kind: "period",
    sort_order: 100,
  });

  await setFlash(error ? "שגיאה בהוספת תקופה" : "התקופה נוספה", error ? "error" : "success");
  revalidatePath("/timeline");
}
