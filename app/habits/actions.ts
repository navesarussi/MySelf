"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import { computeCheckIn, computeFall, todayISO } from "@/lib/habit-stats";
import type { Habit } from "@/lib/types";

export async function addHabit(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "build") as "build" | "quit";
  const target_note = String(formData.get("target_note") || "").trim();
  if (!name) return;

  const supabase = getSupabase();
  await supabase.from("habits").insert({ name, kind, target_note: target_note || null });
  await setFlash("flash.habitAdded");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function checkInHabit(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();

  const { data: habit } = await supabase.from("habits").select("*").eq("id", id).single<Habit>();
  if (!habit) return;

  const today = todayISO();
  const result = computeCheckIn(habit, today);
  if (habit.last_checked_on === today) return;

  await supabase
    .from("habits")
    .update({
      streak_count: result.streak,
      best_streak: result.bestStreak,
      total_success_days: result.totalSuccessDays,
      failure_count: result.failureCount,
      last_checked_on: today,
    })
    .eq("id", id);

  await setFlash("flash.checkInRecorded");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function reportHabitFall(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();

  const { data: habit } = await supabase.from("habits").select("*").eq("id", id).single<Habit>();
  if (!habit) return;

  const today = todayISO();
  const result = computeFall(habit, today);
  if (habit.last_checked_on === today) return;

  await supabase
    .from("habits")
    .update({
      streak_count: result.streak,
      best_streak: result.bestStreak,
      total_success_days: result.totalSuccessDays,
      failure_count: result.failureCount,
      last_checked_on: today,
    })
    .eq("id", id);

  await setFlash("flash.fallRecorded");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function resetHabit(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();

  const { data: habit } = await supabase.from("habits").select("streak_count, failure_count").eq("id", id).single();
  const hadStreak = (habit?.streak_count ?? 0) > 0;

  await supabase
    .from("habits")
    .update({
      streak_count: 0,
      last_checked_on: null,
      failure_count: hadStreak ? (habit?.failure_count ?? 0) + 1 : (habit?.failure_count ?? 0),
    })
    .eq("id", id);

  await setFlash("flash.streakReset");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function updateHabit(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "build") as "build" | "quit";
  const target_note = String(formData.get("target_note") || "").trim();
  const streak_count = Math.max(0, Number(formData.get("streak_count") || 0));
  const best_streak = Math.max(0, Number(formData.get("best_streak") || 0));
  const total_success_days = Math.max(0, Number(formData.get("total_success_days") || 0));
  const failure_count = Math.max(0, Number(formData.get("failure_count") || 0));
  const last_checked_raw = String(formData.get("last_checked_on") || "").trim();

  if (!name) return;

  const supabase = getSupabase();
  await supabase
    .from("habits")
    .update({
      name,
      kind,
      target_note: target_note || null,
      streak_count,
      best_streak: Math.max(best_streak, streak_count),
      total_success_days,
      failure_count,
      last_checked_on: last_checked_raw || null,
    })
    .eq("id", id);

  await setFlash("flash.habitUpdated");
  revalidatePath("/habits");
  revalidatePath("/");
}

export async function deleteHabit(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from("habits").delete().eq("id", id);
  await setFlash("flash.habitDeleted");
  revalidatePath("/habits");
  revalidatePath("/");
}
