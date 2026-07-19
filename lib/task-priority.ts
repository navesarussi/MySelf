import type { Task, TaskPriority } from "@/lib/types";

export const TASK_PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Highest priority first; then due date; then updated_at. */
export function sortTasksByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pr = TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

export function topPriorityTasks(tasks: Task[], limit = 10): Task[] {
  return sortTasksByPriority(tasks).slice(0, limit);
}
