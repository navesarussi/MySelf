import type { HomePayload } from "../api/resources";
import type { Habit, Relationship, Task } from "@/lib/types";

/**
 * Pure, immutable array update helpers for optimistic updates and rollbacks.
 */

export function patchItemInList<T extends { id: string }>(
  list: T[] | null | undefined,
  id: string,
  patch: Partial<T>
): T[] {
  if (!list) return [];
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

export function removeItemFromList<T extends { id: string }>(
  list: T[] | null | undefined,
  id: string
): T[] {
  if (!list) return [];
  return list.filter((item) => item.id !== id);
}

export function prependItemToList<T extends { id: string }>(
  list: T[] | null | undefined,
  item: T
): T[] {
  if (!list) return [item];
  return [item, ...list.filter((existing) => existing.id !== item.id)];
}

export function patchTaskInHome(
  home: HomePayload | undefined,
  taskId: string,
  patch: Partial<Task>
): HomePayload | undefined {
  if (!home) return undefined;
  const existingTask = home.openTasks?.find((t) => t.id === taskId);
  const nextOpenTasks = patch.status === "done"
    ? home.openTasks.filter((t) => t.id !== taskId)
    : home.openTasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));

  let openTasksCount = home.openTasksCount;
  let inProgressTasksCount = home.inProgressTasksCount;

  if (existingTask && patch.status && patch.status !== existingTask.status) {
    if (existingTask.status === "open" && patch.status !== "open") {
      openTasksCount = Math.max(0, openTasksCount - 1);
    } else if (existingTask.status !== "open" && patch.status === "open") {
      openTasksCount += 1;
    }

    if (existingTask.status === "in_progress" && patch.status !== "in_progress") {
      inProgressTasksCount = Math.max(0, inProgressTasksCount - 1);
    } else if (existingTask.status !== "in_progress" && patch.status === "in_progress") {
      inProgressTasksCount += 1;
    }
  }

  return {
    ...home,
    openTasks: nextOpenTasks,
    openTasksCount,
    inProgressTasksCount,
  };
}

export function removeTaskFromHome(
  home: HomePayload | undefined,
  taskId: string
): HomePayload | undefined {
  if (!home) return undefined;
  const existing = home.openTasks?.find((t) => t.id === taskId);
  return {
    ...home,
    openTasks: home.openTasks.filter((t) => t.id !== taskId),
    openTasksCount: existing?.status === "open"
      ? Math.max(0, home.openTasksCount - 1)
      : home.openTasksCount,
    inProgressTasksCount: existing?.status === "in_progress"
      ? Math.max(0, home.inProgressTasksCount - 1)
      : home.inProgressTasksCount,
  };
}

export function patchHabitInHome(
  home: HomePayload | undefined,
  habitId: string,
  patch: Partial<Habit>
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    habits: home.habits.map((h) => (h.id === habitId ? { ...h, ...patch } : h)),
  };
}

export function patchRelationshipInHome(
  home: HomePayload | undefined,
  relId: string,
  patch: Partial<Relationship>
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    relationships: home.relationships.map((r) =>
      r.id === relId ? { ...r, ...patch } : r
    ),
  };
}
