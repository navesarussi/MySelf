import type { Goal, Task } from "./types";

/** Normalized text for identity comparisons (trim + lowercase). */
export function normText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Stable fingerprint for a goal row — mirrors the DB unique index. */
export function goalFingerprint(goal: Pick<Goal, "title" | "category" | "horizon" | "first_step" | "definition_of_done" | "status">): string {
  return [
    normText(goal.title),
    normText(goal.category),
    normText(goal.horizon),
    normText(goal.first_step),
    normText(goal.definition_of_done),
    goal.status,
  ].join("\0");
}

/** Keep the oldest goal when duplicate fingerprints exist (defensive read path). */
export function dedupeGoals<T extends Goal>(goals: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const goal of goals) {
    const key = goalFingerprint(goal);
    const existing = byKey.get(key);
    if (!existing || goal.created_at < existing.created_at) {
      byKey.set(key, goal);
    }
  }
  return Array.from(byKey.values());
}

type TaskIdentity = Pick<Task, "id" | "source" | "external_id" | "created_at" | "synced_at">;

/** Collapse external task copies; manual tasks pass through by id. */
export function dedupeTasks<T extends TaskIdentity>(tasks: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const task of tasks) {
    const key = task.external_id ? `${task.source}:${task.external_id}` : task.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, task);
      continue;
    }
    if (!task.external_id) continue;
    const taskTs = task.synced_at ?? task.created_at;
    const existingTs = existing.synced_at ?? existing.created_at;
    if (taskTs > existingTs) byKey.set(key, task);
  }
  return Array.from(byKey.values());
}

export function habitNameKey(name: string): string {
  return normText(name);
}

/** Postgres / PostgREST unique-violation code. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
