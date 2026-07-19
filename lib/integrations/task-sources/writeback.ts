import type { Task, TaskStatus } from "@/lib/types";
import { getTaskSourceProvider } from "./registry";

/** External providers only understand done ↔ not-done. */
export async function applyExternalStatusChange(task: Task, nextStatus: TaskStatus): Promise<void> {
  if (task.source === "manual") return;
  if (!task.external_id || !task.external_list_id) {
    throw new Error("external_missing_ids");
  }

  const provider = getTaskSourceProvider(task.source);
  if (!provider) {
    throw new Error("provider_not_found");
  }

  const wasDone = task.status === "done";
  const willBeDone = nextStatus === "done";
  if (wasDone === willBeDone) return;

  if (willBeDone) {
    await provider.complete(task.external_id, task.external_list_id);
  } else {
    await provider.reopen(task.external_id, task.external_list_id, {
      statusLabel: task.external_meta?.statusLabel,
    });
  }
}
