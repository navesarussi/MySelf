import type { Task } from "./types";

type TaskTimingRow = Pick<Task, "created_at" | "updated_at" | "status">;

/** Average calendar days from creation to last update for done tasks. */
export function avgTaskCloseDays(tasks: TaskTimingRow[]): number | null {
  const closed = tasks.filter((t) => t.status === "done");
  if (closed.length === 0) return null;

  const totalDays = closed.reduce((sum, t) => {
    const start = Date.parse(t.created_at);
    const end = Date.parse(t.updated_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return sum;
    return sum + (end - start) / 86_400_000;
  }, 0);

  return Math.round((totalDays / closed.length) * 10) / 10;
}
