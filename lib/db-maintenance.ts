import { getSupabase } from "@/lib/supabase";
import { dedupeGoals, goalFingerprint, habitNameKey } from "@/lib/data-integrity";
import type { Goal, Habit, Task } from "@/lib/types";

type MaintenanceResult = {
  goalsRemoved: number;
  habitsRemoved: number;
  tasksRemoved: number;
};

function duplicateGoalIds(goals: Goal[]): string[] {
  const keep = new Set(dedupeGoals(goals).map((goal) => goal.id));
  return goals.filter((goal) => !keep.has(goal.id)).map((goal) => goal.id);
}

function duplicateHabitIds(habits: Habit[]): string[] {
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

function duplicateExternalTaskIds(tasks: Task[]): string[] {
  const byKey = new Map<string, Task>();
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

/** Application-level cleanup when SQL migration cannot run yet. */
export async function runDataIntegrityMaintenance(): Promise<MaintenanceResult> {
  const supabase = getSupabase();
  let goalsRemoved = 0;
  let habitsRemoved = 0;
  let tasksRemoved = 0;

  const { data: goals, error: goalsError } = await supabase.from("goals").select("*");
  if (goalsError) throw new Error(`maintenance_goals_fetch:${goalsError.message}`);
  const goalIds = duplicateGoalIds((goals as Goal[]) ?? []);
  if (goalIds.length) {
    const { error } = await supabase.from("goals").delete().in("id", goalIds);
    if (error) throw new Error(`maintenance_goals_delete:${error.message}`);
    goalsRemoved = goalIds.length;
  }

  const { data: habits, error: habitsError } = await supabase
    .from("habits")
    .select("*")
    .eq("archived", false);
  if (habitsError) throw new Error(`maintenance_habits_fetch:${habitsError.message}`);
  const habitIds = duplicateHabitIds((habits as Habit[]) ?? []);
  if (habitIds.length) {
    const { error } = await supabase.from("habits").delete().in("id", habitIds);
    if (error) throw new Error(`maintenance_habits_delete:${error.message}`);
    habitsRemoved = habitIds.length;
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, source, external_id, created_at, synced_at")
    .not("external_id", "is", null);
  if (tasksError) throw new Error(`maintenance_tasks_fetch:${tasksError.message}`);
  const taskIds = duplicateExternalTaskIds((tasks as Task[]) ?? []);
  if (taskIds.length) {
    const { error } = await supabase.from("tasks").delete().in("id", taskIds);
    if (error) throw new Error(`maintenance_tasks_delete:${error.message}`);
    tasksRemoved = taskIds.length;
  }

  return { goalsRemoved, habitsRemoved, tasksRemoved };
}

export { goalFingerprint };
