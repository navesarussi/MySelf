import type { Task, TaskStatus } from "@/lib/types";
import { getTaskSourceProvider } from "./registry";
import { resolveExternalListId } from "./resolve-list-id";
import { WritebackError } from "./writeback-errors";

/** External providers only understand done ↔ not-done. */
export async function applyExternalStatusChange(task: Task, nextStatus: TaskStatus): Promise<void> {
  if (task.source === "manual" || task.source === "gmail") return;
  if (!task.external_id) {
    throw new WritebackError("external_missing_ids", "external_missing_ids", true);
  }

  const provider = getTaskSourceProvider(task.source);
  if (!provider) {
    throw new WritebackError("provider_not_found", "provider_not_found", false);
  }

  const wasDone = task.status === "done";
  const willBeDone = nextStatus === "done";
  if (wasDone === willBeDone) return;

  const listId = resolveExternalListId(task);
  const mondayLabels = task.external_meta?.statusLabels;

  const mondayOpts =
    task.source === "monday"
      ? {
          statusLabels: mondayLabels,
          statusColumnId: task.external_meta?.statusColumnId,
          statusLabel: task.external_meta?.statusLabel,
        }
      : undefined;

  if (willBeDone) {
    await provider.complete(task.external_id, listId, mondayOpts);
  } else {
    await provider.reopen(task.external_id, listId, mondayOpts ?? { statusLabel: task.external_meta?.statusLabel });
  }
}
