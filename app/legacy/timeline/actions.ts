"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import { parseMinZoom } from "@/lib/timeline-zoom";

export async function addTimelineEvent(formData: FormData) {
  const event_date = String(formData.get("event_date") || "");
  const event_time = String(formData.get("event_time") || "").trim() || null;
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const min_zoom = parseMinZoom(String(formData.get("min_zoom") || ""));

  if (!event_date || !title) {
    await setFlash("flash.eventFieldsRequired", "error");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("timeline_events").insert({
    event_date,
    event_time,
    title,
    description: description || null,
    category: category || null,
    min_zoom,
    source: "manual",
  });

  await setFlash(error ? "flash.eventAddError" : "flash.eventAdded", error ? "error" : "success");
  revalidatePath("/legacy/timeline");
  revalidatePath("/legacy");
}

export async function updateTimelineEvent(formData: FormData) {
  const id = String(formData.get("id") || "");
  const event_date = String(formData.get("event_date") || "");
  const event_time = String(formData.get("event_time") || "").trim() || null;
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const min_zoom = parseMinZoom(String(formData.get("min_zoom") || ""));

  if (!id || !event_date || !title) {
    await setFlash("flash.requiredFields", "error");
    return;
  }

  const supabase = getSupabase();
  const { data: existing } = await supabase.from("timeline_events").select("*").eq("id", id).maybeSingle();
  if (!existing) {
    await setFlash("flash.eventNotFound", "error");
    return;
  }

  if (existing.source === "google_calendar") {
    const { error } = await supabase
      .from("timeline_events")
      .update({
        event_date,
        event_time,
        min_zoom,
        title_override: title === existing.title ? null : title,
        description_override:
          (description || null) === (existing.description || null) ? null : description || null,
      })
      .eq("id", id);
    await setFlash(error ? "flash.eventUpdateError" : "flash.eventUpdated", error ? "error" : "success");
  } else {
    const { error } = await supabase
      .from("timeline_events")
      .update({
        event_date,
        event_time,
        title,
        description: description || null,
        category: category || null,
        min_zoom,
      })
      .eq("id", id);
    await setFlash(error ? "flash.eventUpdateError" : "flash.eventUpdated", error ? "error" : "success");
  }

  revalidatePath("/legacy/timeline");
  revalidatePath("/legacy");
}

export async function deleteTimelineEvent(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  const { data: existing } = await supabase.from("timeline_events").select("source").eq("id", id).maybeSingle();

  if (existing?.source === "google_calendar") {
    const { error } = await supabase
      .from("timeline_events")
      .update({ hidden_at: new Date().toISOString() })
      .eq("id", id);
    await setFlash(error ? "flash.eventHideError" : "flash.eventHidden", error ? "error" : "success");
  } else {
    const { error } = await supabase.from("timeline_events").delete().eq("id", id);
    await setFlash(error ? "flash.eventDeleteError" : "flash.eventDeleted", error ? "error" : "success");
  }

  revalidatePath("/legacy/timeline");
  revalidatePath("/legacy");
}

export async function addLifePeriod(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const start_date = String(formData.get("start_date") || "");
  const end_date = String(formData.get("end_date") || "") || null;
  const color = String(formData.get("color") || "#7dd3c0");
  if (!title || !start_date) {
    await setFlash("flash.periodFieldsRequired", "error");
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

  await setFlash(error ? "flash.periodAddError" : "flash.periodAdded", error ? "error" : "success");
  revalidatePath("/legacy/timeline");
}

export async function updateLifePeriod(formData: FormData) {
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const start_date = String(formData.get("start_date") || "");
  const end_date = String(formData.get("end_date") || "").trim() || null;
  const color = String(formData.get("color") || "#7dd3c0");
  const kind = String(formData.get("kind") || "period");

  if (!id || !title || !start_date) {
    await setFlash("flash.periodEditRequired", "error");
    return;
  }
  if (end_date && end_date < start_date) {
    await setFlash("flash.periodEndInvalid", "error");
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("life_periods")
    .update({ title, start_date, end_date, color, kind })
    .eq("id", id);

  await setFlash(error ? "flash.periodUpdateError" : "flash.periodUpdated", error ? "error" : "success");
  revalidatePath("/legacy/timeline");
}

export async function deleteLifePeriod(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const supabase = getSupabase();
  const { error } = await supabase.from("life_periods").delete().eq("id", id);
  await setFlash(error ? "flash.periodDeleteError" : "flash.periodDeleted", error ? "error" : "success");
  revalidatePath("/legacy/timeline");
}
