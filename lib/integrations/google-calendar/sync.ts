import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/db/paginate";
import { GOOGLE_PROVIDER } from "../google-config";
import {
  getIntegrationToken,
  saveIntegrationToken,
  setSyncCompleted,
  setSyncFailed,
  setSyncRunning,
  updateSyncProgress,
} from "../tokens";
import { refreshAccessToken, fetchAllPrimaryEvents } from "./client";
import { mapGoogleEvent } from "./map";
import { buildUpsertPayload, shouldRemoveLocal } from "./merge";
import type { MappedGoogleEvent } from "./types";

const UPSERT_BATCH = 100;

async function getValidAccessToken() {
  const row = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!row) throw new Error("not_connected");

  if (row.expires_at) {
    const expires = new Date(row.expires_at).getTime();
    if (Date.now() < expires - 60_000) return row.access_token;
  }

  if (!row.refresh_token) throw new Error("missing_refresh_token");
  const refreshed = await refreshAccessToken(row.refresh_token);
  const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await saveIntegrationToken({
    provider: GOOGLE_PROVIDER,
    access_token: refreshed.access_token,
    refresh_token: row.refresh_token,
    expires_at,
    last_sync_at: row.last_sync_at,
    sync_status: row.sync_status,
    sync_progress: row.sync_progress,
    sync_started_at: row.sync_started_at,
  });
  return refreshed.access_token;
}

type LocalGoogleEvent = {
  id: string;
  source: string;
  google_event_id: string | null;
  title_override: string | null;
  description_override: string | null;
  hidden_at: string | null;
};

/**
 * Every locally stored Google event, with the edits the user made on top of it.
 *
 * Ordered by id, because `range()` over an unordered query is not stable in
 * Postgres: pages could repeat rows and skip others, and a skipped row is a
 * title override, a description override or a hidden flag that the sync then
 * overwrites with Google's version — a hidden event reappearing, or an edit
 * silently reverted.
 */
async function fetchAllLocalGoogleEvents(errorTag: string): Promise<LocalGoogleEvent[]> {
  const supabase = getSupabase();
  return fetchAllRows<LocalGoogleEvent>(async (from, to) => {
    const { data, error } = await supabase
      .from("timeline_events")
      .select("id, source, google_event_id, title_override, description_override, hidden_at")
      .eq("source", "google_calendar")
      .order("id")
      .range(from, to);
    return { data, error: error ? { message: `${errorTag}:${error.message}` } : null };
  });
}

export async function syncGoogleCalendar(): Promise<{ imported: number; removed: number }> {
  await setSyncRunning(GOOGLE_PROVIDER);

  try {
    const accessToken = await getValidAccessToken();

    await updateSyncProgress(GOOGLE_PROVIDER, {
      phase: "fetching",
      total: 0,
      processed: 0,
      imported: 0,
    });

    const googleEvents = await fetchAllPrimaryEvents(accessToken);
    const supabase = getSupabase();

    const mappedEvents = googleEvents
      .map(mapGoogleEvent)
      .filter((mapped): mapped is MappedGoogleEvent => mapped !== null);

    const fetchedIds = new Set(mappedEvents.map((event) => event.google_event_id));
    const existingRows = await fetchAllLocalGoogleEvents("sync_fetch_existing_failed");
    const existingById = new Map(existingRows.map((row) => [row.google_event_id, row]));

    const toUpsert = mappedEvents
      .filter((mapped) => !existingById.get(mapped.google_event_id)?.hidden_at)
      .map((mapped) => buildUpsertPayload(mapped, existingById.get(mapped.google_event_id) ?? null))
      .sort(
        (a, b) =>
          b.event_date.localeCompare(a.event_date) ||
          (b.event_time ?? "").localeCompare(a.event_time ?? "")
      );

    await updateSyncProgress(GOOGLE_PROVIDER, {
      phase: "upserting",
      total: toUpsert.length,
      processed: 0,
      imported: 0,
    });

    let imported = 0;
    for (let i = 0; i < toUpsert.length; i += UPSERT_BATCH) {
      const chunk = toUpsert.slice(i, i + UPSERT_BATCH);
      const { error } = await supabase
        .from("timeline_events")
        .upsert(chunk, { onConflict: "google_event_id" });
      if (error) throw new Error(`sync_upsert_failed:${error.message}`);

      imported += chunk.length;
      await updateSyncProgress(GOOGLE_PROVIDER, {
        phase: "upserting",
        total: toUpsert.length,
        processed: imported,
        imported,
      });
    }

    await updateSyncProgress(GOOGLE_PROVIDER, {
      phase: "cleanup",
      total: toUpsert.length,
      processed: toUpsert.length,
      imported,
    });

    const localGoogle = await fetchAllLocalGoogleEvents("sync_fetch_local_failed");
    let removed = 0;
    const toDelete = localGoogle
      .filter((row) => shouldRemoveLocal(row, fetchedIds))
      .map((row) => row.id);

    for (let i = 0; i < toDelete.length; i += UPSERT_BATCH) {
      const chunk = toDelete.slice(i, i + UPSERT_BATCH);
      await supabase.from("timeline_events").delete().in("id", chunk);
      removed += chunk.length;
    }

    await setSyncCompleted(GOOGLE_PROVIDER);
    return { imported, removed };
  } catch (err) {
    await setSyncFailed(GOOGLE_PROVIDER);
    throw err;
  }
}
