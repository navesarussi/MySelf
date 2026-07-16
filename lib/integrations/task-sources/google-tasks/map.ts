import type { ExternalTaskDraft } from "../types";
import type { GoogleTask } from "./types";

function parseDueDate(due: string): string {
  const match = due.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return new Date(due).toISOString().slice(0, 10);
}

export function mapGoogleTask(
  task: GoogleTask,
  listId: string,
  listTitle: string
): ExternalTaskDraft | null {
  if (!task.id) return null;
  if (task.status === "completed") return null;

  const meta: ExternalTaskDraft["meta"] = { listTitle };
  if (task.parent) {
    meta.parentExternalId = task.parent;
  }

  return {
    externalId: task.id,
    externalListId: listId,
    title: task.title?.trim() || "Untitled",
    notes: task.notes?.trim() || null,
    dueDate: task.due ? parseDueDate(task.due) : null,
    status: "open",
    meta,
  };
}
