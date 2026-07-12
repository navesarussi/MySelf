"use server";

import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { setFlash } from "@/lib/flash-actions";
import { computeCheckIn, todayISO } from "@/lib/habit-stats";
import type { Habit } from "@/lib/types";

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

  await setFlash("צ׳ק־אין נרשם");
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
  revalidatePath("/");
}
