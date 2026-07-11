"use server";

import { revalidatePath } from "next/cache";
import { differenceInCalendarDays } from "date-fns";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import type { Habit } from "@/lib/types";

const todayISO = () => new Date().toISOString().slice(0, 10);

export async function addHabit(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "build") as "build" | "quit";
  const target_note = String(formData.get("target_note") || "").trim();
  if (!name) return;

  const supabase = getSupabase();
  await supabase.from("habits").insert({ name, kind, target_note: target_note || null });
  await setFlash("ההרגל נוסף");
  revalidatePath("/habits");
}

export async function checkInHabit(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();

  const { data: habit } = await supabase.from("habits").select("*").eq("id", id).single<Habit>();
  if (!habit) return;

  const today = todayISO();
  if (habit.last_checked_on === today) return; // already checked today

  const gap = habit.last_checked_on ? differenceInCalendarDays(new Date(today), new Date(habit.last_checked_on)) : null;
  const newStreak = gap === 1 ? habit.streak_count + 1 : 1;
  const bestStreak = Math.max(habit.best_streak, newStreak);

  await supabase
    .from("habits")
    .update({ streak_count: newStreak, best_streak: bestStreak, last_checked_on: today })
    .eq("id", id);

  await setFlash("צ׳ק־אין נרשם");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function resetHabit(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("habits").update({ streak_count: 0, last_checked_on: null }).eq("id", id);
  await setFlash("הרצף אופס");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function deleteHabit(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("habits").delete().eq("id", id);
  await setFlash("ההרגל נמחק");
  revalidatePath("/habits");
}

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
  await setFlash("המטרה נוספה");
  revalidatePath("/habits");
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
  await setFlash("המטרה עודכנה");
  revalidatePath("/habits");
}

export async function deleteGoal(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("goals").delete().eq("id", id);
  await setFlash("המטרה נמחקה");
  revalidatePath("/habits");
}

export async function addCommitment(formData: FormData) {
  const text = String(formData.get("text") || "").trim();
  const commitment_date = String(formData.get("commitment_date") || todayISO());
  if (!text) return;
  const supabase = getSupabase();
  await supabase.from("commitments").insert({ text, commitment_date });
  await setFlash("ההתחייבות נוספה");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function setCommitmentStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "pending");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("commitments").update({ status }).eq("id", id);
  await setFlash("ההתחייבות עודכנה");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function deleteCommitment(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("commitments").delete().eq("id", id);
  await setFlash("ההתחייבות נמחקה");
  revalidatePath("/habits");
}
