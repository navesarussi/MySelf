import { getSupabase } from "@/lib/supabase";
import type { IntegrationToken, SyncProgress, SyncStatus } from "@/lib/types";
import { GOOGLE_PROVIDER } from "./google-config";

const STALE_SYNC_MS = 30 * 60 * 1000;

export async function getIntegrationToken(provider: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("integration_tokens")
    .select("*")
    .eq("provider", provider)
    .maybeSingle();
  return (data as IntegrationToken | null) ?? null;
}

export async function saveIntegrationToken(
  row: Omit<IntegrationToken, "connected_at" | "last_sync_at" | "sync_status" | "sync_progress" | "sync_started_at"> & {
    last_sync_at?: string | null;
    sync_status?: SyncStatus;
    sync_progress?: SyncProgress | null;
    sync_started_at?: string | null;
  }
) {
  const supabase = getSupabase();
  await supabase.from("integration_tokens").upsert({
    provider: row.provider,
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    connected_at: new Date().toISOString(),
    last_sync_at: row.last_sync_at ?? null,
    sync_status: row.sync_status ?? "idle",
    sync_progress: row.sync_progress ?? null,
    sync_started_at: row.sync_started_at ?? null,
  });
}

export async function deleteIntegrationToken(provider: string) {
  const supabase = getSupabase();
  await supabase.from("integration_tokens").delete().eq("provider", provider);
}

export async function touchLastSync(provider: string) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("provider", provider);
}

export async function setSyncRunning(provider: string) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({
      sync_status: "running",
      sync_started_at: new Date().toISOString(),
      sync_progress: { phase: "fetching", total: 0, processed: 0, imported: 0 },
    })
    .eq("provider", provider);
}

export async function updateSyncProgress(provider: string, progress: SyncProgress) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ sync_progress: progress })
    .eq("provider", provider);
}

export async function setSyncCompleted(provider: string) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({
      sync_status: "completed",
      sync_progress: null,
      last_sync_at: new Date().toISOString(),
    })
    .eq("provider", provider);
}

export async function setSyncFailed(provider: string) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ sync_status: "failed", sync_progress: null })
    .eq("provider", provider);
}

export async function tryStartSync(provider: string): Promise<boolean> {
  const token = await getIntegrationToken(provider);
  if (!token) return false;

  if (token.sync_status === "running" && token.sync_started_at) {
    const started = new Date(token.sync_started_at).getTime();
    if (Date.now() - started < STALE_SYNC_MS) return false;
  }

  await setSyncRunning(provider);
  return true;
}

export async function isGoogleConnected() {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  return token != null;
}
