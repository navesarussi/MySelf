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
    task: "/tasks?add=task",
    contact: "/relationships?add=contact",
    event: "/timeline?add=event",
    period: "/timeline?add=period",
    project: "/projects?add=project",
    habit: "/habits?add=habit",
    goal: "/goals?add=goal",
    commitment: "/goals?add=commitment",
    entry: "/library?add=entry",
  };
  return routes[target];
}
