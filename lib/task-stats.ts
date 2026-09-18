import type { Task } from "./types";

type TaskTimingRow = Pick<Task, "created_at" | "updated_at" | "status">;

/** Average calendar days from creation to last update for done tasks.
 *
 *  Rows with unparseable or inverted timestamps are excluded from both the sum
 *  and the divisor — counting them as zero-day closes dragged the average down. */
export function avgTaskCloseDays(tasks: TaskTimingRow[]): number | null {
  let totalDays = 0;
  let counted = 0;

  for (const t of tasks) {
    if (t.status !== "done") continue;
    const start = Date.parse(t.created_at);
    const end = Date.parse(t.updated_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    totalDays += (end - start) / 86_400_000;
    counted += 1;
  }

  if (counted === 0) return null;
  return Math.round((totalDays / counted) * 10) / 10;
}
