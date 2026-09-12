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

/**
 * Collapse drafts sharing an external id (the same item reachable from two
 * selected lists). A chunked upsert would otherwise hit the same row twice in
 * one statement, which Postgres rejects on ON CONFLICT. Last draft wins.
 */
export function dedupeDraftsByExternalId<T extends { externalId: string }>(drafts: T[]): T[] {
  const byId = new Map<string, T>();
  for (const draft of drafts) byId.set(draft.externalId, draft);
  return [...byId.values()];
}

export function idsToMarkDone(localOpenExternalIds: string[], fetchedIds: Set<string>) {
  return localOpenExternalIds.filter((id) => !fetchedIds.has(id));
}
