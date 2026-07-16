import { LEGACY_BASE } from "@/lib/legacy-path";

export type AddTarget =
  | "task"
  | "contact"
  | "event"
  | "period"
  | "project"
  | "habit"
  | "goal"
  | "commitment"
  | "entry";

const ADD_TARGETS: AddTarget[] = [
  "task",
  "contact",
  "event",
  "period",
  "project",
  "habit",
  "goal",
  "commitment",
  "entry",
];

export function isAddTarget(value: string | undefined | null): value is AddTarget {
  return value != null && (ADD_TARGETS as string[]).includes(value);
}

export function addTargetHref(target: AddTarget): string {
  const routes: Record<AddTarget, string> = {
    task: `${LEGACY_BASE}/tasks?add=task`,
    contact: `${LEGACY_BASE}/relationships?add=contact`,
    event: `${LEGACY_BASE}/timeline?add=event`,
    period: `${LEGACY_BASE}/timeline?add=period`,
    project: `${LEGACY_BASE}/projects?add=project`,
    habit: `${LEGACY_BASE}/habits?add=habit`,
    goal: `${LEGACY_BASE}/goals?add=goal`,
    commitment: `${LEGACY_BASE}/goals?add=commitment`,
    entry: `${LEGACY_BASE}/library?add=entry`,
  };
  return routes[target];
}
