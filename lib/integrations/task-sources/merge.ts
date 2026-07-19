import type { ExternalTaskDraft, TaskSourceId } from "./types";

export function buildExternalTaskUpsert(
  draft: ExternalTaskDraft,
  source: TaskSourceId,
  syncedAt: string
) {
  return {
    source,
    external_id: draft.externalId,
    external_list_id: draft.externalListId,
    project_id: null,
    title: draft.title,
    notes: draft.notes,
    due_date: draft.dueDate,
    status: draft.status === "done" ? "done" : "open",
    priority: "medium" as const,
    external_meta: draft.meta,
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

export function idsToMarkDone(localOpenExternalIds: string[], fetchedIds: Set<string>) {
  return localOpenExternalIds.filter((id) => !fetchedIds.has(id));
}
