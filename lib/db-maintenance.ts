import { getSupabase } from "@/lib/supabase";
import { userDb } from "@/lib/db/user-db";
import { fetchAllRows } from "@/lib/db/paginate";
import { dedupeGoals, goalFingerprint, habitNameKey } from "@/lib/data-integrity";
import type { Goal, Habit, Task } from "@/lib/types";

/** The columns the external-task dedupe reads — the query selects only these. */
export type TaskDedupeRow = Pick<Task, "id" | "source" | "external_id" | "created_at" | "synced_at">;

type MaintenanceResult = {
  goalsRemoved: number;
  habitsRemoved: number;
  tasksRemoved: number;
};

export function duplicateGoalIds(goals: Goal[]): string[] {
  const keep = new Set(dedupeGoals(goals).map((goal) => goal.id));
  return goals.filter((goal) => !keep.has(goal.id)).map((goal) => goal.id);
}

export function duplicateHabitIds(habits: Habit[]): string[] {
  const byName = new Map<string, Habit>();
  for (const habit of habits) {
    const key = habitNameKey(habit.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, habit);
      continue;
    }
    const keepExisting =
      existing.best_streak > habit.best_streak ||
      (existing.best_streak === habit.best_streak && existing.streak_count > habit.streak_count) ||
      (existing.best_streak === habit.best_streak &&
        existing.streak_count === habit.streak_count &&
        existing.created_at <= habit.created_at);
    if (keepExisting) byName.set(key, existing);
    else byName.set(key, habit);
  }
  const keep = new Set([...byName.values()].map((habit) => habit.id));
  return habits.filter((habit) => !keep.has(habit.id)).map((habit) => habit.id);
}

export function duplicateExternalTaskIds(tasks: TaskDedupeRow[]): string[] {
  const byKey = new Map<string, TaskDedupeRow>();
  for (const task of tasks) {
    if (!task.external_id) continue;
    const key = `${task.source}:${task.external_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, task);
      continue;
    }
    const taskTs = task.synced_at ?? task.created_at;
    const existingTs = existing.synced_at ?? existing.created_at;
    if (taskTs > existingTs) byKey.set(key, task);
  }
  const keep = new Set([...byKey.values()].map((task) => task.id));
  return tasks.filter((task) => task.external_id && !keep.has(task.id)).map((task) => task.id);
}

/**
 * Application-level cleanup when SQL migration cannot run yet.
 *
 * Every read is paged and ordered. Unbounded, these stopped at PostgREST's row
 * cap, and because they were unordered the prefix varied per run: the job might
 * see both copies of a duplicate one day and only one the next, so the cleanup
 * was not merely incomplete but non-deterministic. The dedupe helpers only
 * return rows they saw a survivor for, so a truncated read could never delete
 * a last copy — but it could quietly stop cleaning.
 */
export async function runDataIntegrityMaintenance(): Promise<MaintenanceResult> {
  const supabase = getSupabase();
  const db = await userDb();
  let goalsRemoved = 0;
  let habitsRemoved = 0;
  let tasksRemoved = 0;

  const goals = await fetchAllRows<Goal>(async (from, to) => {
    const { data, error } = await db.from("goals").select("*").order("id").range(from, to);
    return { data, error: error ? { message: `maintenance_goals_fetch:${error.message}` } : null };
  });
  const goalIds = duplicateGoalIds(goals);
  if (goalIds.length) {
    const { error } = await db.from("goals").delete().in("id", goalIds);
    if (error) throw new Error(`maintenance_goals_delete:${error.message}`);
    goalsRemoved = goalIds.length;
  }

  const habits = await fetchAllRows<Habit>(async (from, to) => {
    const { data, error } = await db
      .from("habits")
      .select("*")
      .eq("archived", false)
      .order("id")
      .range(from, to);
    return { data, error: error ? { message: `maintenance_habits_fetch:${error.message}` } : null };
  });
  const habitIds = duplicateHabitIds(habits);
  if (habitIds.length) {
    const { error } = await db.from("habits").delete().in("id", habitIds);
    if (error) throw new Error(`maintenance_habits_delete:${error.message}`);
    habitsRemoved = habitIds.length;
  }

  const tasks = await fetchAllRows<TaskDedupeRow>(async (from, to) => {
    const { data, error } = await db
      .from("tasks")
      .select("id, source, external_id, created_at, synced_at")
      .not("external_id", "is", null)
      .order("id")
      .range(from, to);
    return {
      data: data as TaskDedupeRow[] | null,
      error: error ? { message: `maintenance_tasks_fetch:${error.message}` } : null,
    };
  });
  const taskIds = duplicateExternalTaskIds(tasks);
  if (taskIds.length) {
    const { error } = await db.from("tasks").delete().in("id", taskIds);
    if (error) throw new Error(`maintenance_tasks_delete:${error.message}`);
    tasksRemoved = taskIds.length;
  }

  return { goalsRemoved, habitsRemoved, tasksRemoved };
}

export { goalFingerprint };
