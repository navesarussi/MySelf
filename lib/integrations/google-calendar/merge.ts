import type { MappedGoogleEvent } from "./types";

type ExistingRow = {
  title_override: string | null;
  description_override: string | null;
  hidden_at: string | null;
};

export function buildUpsertPayload(mapped: MappedGoogleEvent, existing: ExistingRow | null) {
  const base = {
    ...mapped,
    synced_at: new Date().toISOString(),
  };
  if (!existing) return base;
  return {
    ...base,
    title_override: existing.title_override ?? undefined,
    description_override: existing.description_override ?? undefined,
    hidden_at: existing.hidden_at ?? undefined,
  };
}

export function shouldRemoveLocal(
  row: {
    source: string;
    google_event_id: string | null;
    title_override: string | null;
    description_override: string | null;
    hidden_at: string | null;
  },
  fetchedIds: Set<string>
) {
  if (row.source !== "google_calendar" || !row.google_event_id) return false;
  if (row.hidden_at) return false;
  if (row.title_override || row.description_override) return false;
  return !fetchedIds.has(row.google_event_id);
}
