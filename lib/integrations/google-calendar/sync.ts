import { getSupabase } from "@/lib/supabase";
import { GOOGLE_PROVIDER } from "../google-config";
import { getIntegrationToken, saveIntegrationToken, touchLastSync } from "../tokens";
import { refreshAccessToken, fetchAllPrimaryEvents } from "./client";
import { mapGoogleEvent } from "./map";
import { buildUpsertPayload, shouldRemoveLocal } from "./merge";

async function getValidAccessToken() {
  const row = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!row) throw new Error("not_connected");

  const expires = new Date(row.expires_at).getTime();
  if (Date.now() < expires - 60_000) return row.access_token;

  const refreshed = await refreshAccessToken(row.refresh_token);
  const expires_at = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await saveIntegrationToken({
    provider: GOOGLE_PROVIDER,
    access_token: refreshed.access_token,
    refresh_token: row.refresh_token,
    expires_at,
    last_sync_at: row.last_sync_at,
  });
  return refreshed.access_token;
}

export async function syncGoogleCalendar(): Promise<{ imported: number; removed: number }> {
  const accessToken = await getValidAccessToken();
  const googleEvents = await fetchAllPrimaryEvents(accessToken);
  const supabase = getSupabase();

  const fetchedIds = new Set<string>();
  let imported = 0;

  for (const g of googleEvents) {
    const mapped = mapGoogleEvent(g);
    if (!mapped) continue;
    fetchedIds.add(mapped.google_event_id);

    const { data: existing } = await supabase
      .from("timeline_events")
      .select("title_override, description_override, hidden_at")
      .eq("google_event_id", mapped.google_event_id)
      .maybeSingle();

    if (existing?.hidden_at) continue;

    const payload = buildUpsertPayload(mapped, existing);
    const { error } = await supabase.from("timeline_events").upsert(payload, {
      onConflict: "google_event_id",
    });
    if (!error) imported++;
  }

  const { data: localGoogle } = await supabase
    .from("timeline_events")
    .select("id, source, google_event_id, title_override, description_override, hidden_at")
    .eq("source", "google_calendar");

  let removed = 0;
  for (const row of localGoogle ?? []) {
    if (shouldRemoveLocal(row, fetchedIds)) {
      await supabase.from("timeline_events").delete().eq("id", row.id);
      removed++;
    }
  }

  await touchLastSync(GOOGLE_PROVIDER);
  return { imported, removed };
}
