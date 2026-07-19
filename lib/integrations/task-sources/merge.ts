import type { ExternalTaskDraft, TaskSourceId } from "./types";
import type { TaskPriority, TaskStatus } from "@/lib/types";

const LOCAL_RICH_STATUSES: TaskStatus[] = ["in_progress", "stuck", "review"];

export type ExistingExternalTask = {
  status: TaskStatus;
  priority: TaskPriority;
};

export function resolveExternalSyncStatus(
  draftStatus: "open" | "done",
  existingStatus?: TaskStatus
): TaskStatus {
  if (draftStatus === "done") return "done";
  if (existingStatus && LOCAL_RICH_STATUSES.includes(existingStatus)) return existingStatus;
  return "open";
}

export function buildExternalTaskUpsert(
  draft: ExternalTaskDraft,
  source: TaskSourceId,
  syncedAt: string,
  existing?: ExistingExternalTask
) {
  return {
    source,
    external_id: draft.externalId,
    external_list_id: draft.externalListId,
    project_id: null,
    title: draft.title,
    notes: draft.notes,
    due_date: draft.dueDate,
    status: resolveExternalSyncStatus(draft.status, existing?.status),
    priority: existing?.priority ?? ("medium" as const),
    external_meta: draft.meta,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

export function idsToMarkDone(localOpenExternalIds: string[], fetchedIds: Set<string>) {
  return localOpenExternalIds.filter((id) => !fetchedIds.has(id));
}
