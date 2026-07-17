import type { Task, TaskStatus } from "@/lib/types";
import { getTaskSourceProvider } from "./registry";

export async function applyExternalStatusChange(task: Task, nextStatus: TaskStatus): Promise<void> {
  if (task.source === "manual") return;
  if (!task.external_id || !task.external_list_id) {
    throw new Error("external_missing_ids");
  }

  const provider = getTaskSourceProvider(task.source);
  if (!provider) {
    throw new Error("provider_not_found");
  }

  if (nextStatus === "done") {
    await provider.complete(task.external_id, task.external_list_id);
  } else if (nextStatus === "open" && task.status === "done") {
    await provider.reopen(task.external_id, task.external_list_id);
  }
}
