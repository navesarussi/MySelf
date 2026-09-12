import type { Task } from "@/lib/types";

/** Supabase returns an embedded relation as an object or an array depending on the query shape. */
export type TaskJoin = Task & { projects?: { name: string } | { name: string }[] | null };

/** Columns the task endpoints select. `notes` is truncated by the list, full on detail. */
export const TASK_SELECT =
  "id, title, project_id, priority, status, due_date, notes, source, external_id, external_list_id, external_meta, synced_at, created_at, updated_at, projects(name)";

export function projectNameFromJoin(projects: TaskJoin["projects"]): string | undefined {
  if (!projects) return undefined;
  if (Array.isArray(projects)) return projects[0]?.name;
  return projects.name;
}

/** Notes preview length for list payloads — full text comes from `GET /tasks/:id`. */
export const NOTES_PREVIEW_CHARS = 200;

/**
 * Trim a note down to a card-sized preview. Returns the original when it
 * already fits, so `notes_truncated` stays false for the common case and the
 * editor can skip the detail fetch.
 */
export function previewNotes(notes: string | null | undefined): {
  notes: string | null;
  truncated: boolean;
} {
  if (!notes) return { notes: notes ?? null, truncated: false };
  if (notes.length <= NOTES_PREVIEW_CHARS) return { notes, truncated: false };
  return { notes: notes.slice(0, NOTES_PREVIEW_CHARS), truncated: true };
}
