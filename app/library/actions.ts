"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";

export async function addContentEntry(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const tagsRaw = String(formData.get("tags") || "").trim();
  if (!title || !body) return;

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const supabase = getSupabase();
  await supabase.from("content_entries").insert({
    title,
    category: category || "כללי",
    body,
    tags,
  });
  await setFlash("הרשומה נוספה");
  revalidatePath("/library");
}

export async function updateContentEntry(formData: FormData) {
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const tagsRaw = String(formData.get("tags") || "").trim();
  if (!id || !title || !body) return;

  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const supabase = getSupabase();
  await supabase
    .from("content_entries")
    .update({ title, category: category || "כללי", body, tags, updated_at: new Date().toISOString() })
    .eq("id", id);
  await setFlash("הרשומה עודכנה");
  revalidatePath("/library");
}

export async function deleteContentEntry(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("content_entries").delete().eq("id", id);
  await setFlash("הרשומה נמחקה");
  revalidatePath("/library");
}
