import type { Task, TaskPriority } from "@/lib/types";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const URGENT_DUE_DAYS = 30;

export function isTaskUrgentByDueDate(dueDate: string | null, now: Date): boolean {
  if (!dueDate) return true;
  const due = new Date(`${dueDate}T12:00:00`);
  const days = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return days <= URGENT_DUE_DAYS;
}

export function effectiveTaskPriority(task: Task, now: Date): TaskPriority {
  if (task.due_date && !isTaskUrgentByDueDate(task.due_date, now)) {
    return "low";
  }
  return task.priority;
}

export function rankUrgentTasks(tasks: Task[], now = new Date()): Task[] {
  return [...tasks]
    .filter((t) => ["open", "in_progress", "stuck", "review"].includes(t.status))
    .sort((a, b) => {
      const pa = PRIORITY_RANK[effectiveTaskPriority(a, now)];
      const pb = PRIORITY_RANK[effectiveTaskPriority(b, now)];
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      return 0;
    })
    .slice(0, 5);
}
