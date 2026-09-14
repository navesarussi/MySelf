import type { HomePayload } from "../api/resources";
import type { ContentEntry, Goal, Habit, Relationship, Task, TimelineEvent } from "@/lib/types";

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
  let doneTasksCount = home.doneTasksCount;

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

    if (patch.status === "done" && existingTask.status !== "done") {
      doneTasksCount += 1;
    } else if (existingTask.status === "done" && patch.status !== "done") {
      doneTasksCount = Math.max(0, doneTasksCount - 1);
    }
  }

  return {
    ...home,
    openTasks: nextOpenTasks,
    openTasksCount,
    inProgressTasksCount,
    doneTasksCount,
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

export function removeHabitFromHome(
  home: HomePayload | undefined,
  habitId: string
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    habits: home.habits.filter((h) => h.id !== habitId),
  };
}

export function removeRelationshipFromHome(
  home: HomePayload | undefined,
  relId: string
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    relationships: home.relationships.filter((r) => r.id !== relId),
  };
}

export function setGoalStatusInHome(
  home: HomePayload | undefined,
  goal: Goal,
  nextStatus: Goal["status"]
): HomePayload | undefined {
  if (!home) return undefined;
  if (nextStatus === "done") {
    const wasActive = home.activeGoals.some((g) => g.id === goal.id);
    return {
      ...home,
      activeGoals: home.activeGoals.filter((g) => g.id !== goal.id),
      doneGoalsCount: wasActive ? home.doneGoalsCount + 1 : home.doneGoalsCount,
    };
  }
  const exists = home.activeGoals.some((g) => g.id === goal.id);
  return {
    ...home,
    activeGoals: exists
      ? home.activeGoals.map((g) => (g.id === goal.id ? { ...g, status: "active" } : g))
      : [...home.activeGoals, { ...goal, status: "active" }],
    doneGoalsCount: Math.max(0, home.doneGoalsCount - 1),
  };
}

export function patchGoalInHome(
  home: HomePayload | undefined,
  goalId: string,
  patch: Partial<Goal>
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    activeGoals: home.activeGoals.map((g) => (g.id === goalId ? { ...g, ...patch } : g)),
  };
}

export function removeGoalFromHome(
  home: HomePayload | undefined,
  goalId: string
): HomePayload | undefined {
  if (!home) return undefined;
  const wasActive = home.activeGoals.some((g) => g.id === goalId);
  return {
    ...home,
    activeGoals: home.activeGoals.filter((g) => g.id !== goalId),
    doneGoalsCount: wasActive ? Math.max(0, home.doneGoalsCount - 1) : home.doneGoalsCount,
  };
}

export function removeCommitmentFromHome(
  home: HomePayload | undefined,
  commitmentId: string
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    pendingCommitments: home.pendingCommitments.filter((c) => c.id !== commitmentId),
  };
}

export function patchLibraryEntryInHome(
  home: HomePayload | undefined,
  entryId: string,
  patch: Partial<Pick<ContentEntry, "id" | "title" | "category" | "tags" | "updated_at">>
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    libraryEntries: home.libraryEntries.map((e) =>
      e.id === entryId ? { ...e, ...patch } : e
    ),
  };
}

export function removeLibraryEntryFromHome(
  home: HomePayload | undefined,
  entryId: string
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    libraryEntries: home.libraryEntries.filter((e) => e.id !== entryId),
  };
}

export function patchEventInHome(
  home: HomePayload | undefined,
  eventId: string,
  patch: Partial<TimelineEvent>
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    recentEvents: home.recentEvents.map((e) =>
      e.id === eventId ? { ...e, ...patch } : e
    ),
  };
}

export function removeEventFromHome(
  home: HomePayload | undefined,
  eventId: string
): HomePayload | undefined {
  if (!home) return undefined;
  return {
    ...home,
    recentEvents: home.recentEvents.filter((e) => e.id !== eventId),
  };
}

export function decFinanceUncategorizedInHome(
  home: HomePayload | undefined
): HomePayload | undefined {
  if (!home) return undefined;
  const uncategorized = Math.max(0, home.financeUncategorizedCount - 1);
  return {
    ...home,
    financeUncategorizedCount: uncategorized,
    finance: {
      month: home.finance?.month ?? "",
      net_actual: home.finance?.net_actual ?? 0,
      uncategorized_count: uncategorized,
    },
  };
}
