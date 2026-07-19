import { getSupabase } from "@/lib/supabase";
import type { IntegrationToken, SyncProgress, SyncStatus } from "@/lib/types";
import { GOOGLE_PROVIDER } from "./google-config";

const STALE_SYNC_MS = 30 * 60 * 1000;

export async function getIntegrationToken(provider: string, accountKey = "") {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("integration_tokens")
    .select("*")
    .eq("provider", provider)
    .eq("account_key", accountKey)
    .maybeSingle();
  return (data as IntegrationToken | null) ?? null;
}

export async function listIntegrationTokens(provider: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("integration_tokens")
    .select("*")
    .eq("provider", provider)
    .order("connected_at", { ascending: true });
  return (data as IntegrationToken[]) ?? [];
}

export async function saveIntegrationToken(
  row: Omit<
    IntegrationToken,
    | "connected_at"
    | "last_sync_at"
    | "sync_status"
    | "sync_progress"
    | "sync_started_at"
    | "settings"
    | "account_key"
    | "refresh_token"
    | "expires_at"
  > & {
    account_key?: string;
    last_sync_at?: string | null;
    sync_status?: SyncStatus;
    sync_progress?: SyncProgress | null;
    sync_started_at?: string | null;
    settings?: Record<string, unknown>;
    refresh_token?: string | null;
    expires_at?: string | null;
  }
) {
  const supabase = getSupabase();
  const account_key = row.account_key ?? "";
  let settings = row.settings;
  if (settings === undefined) {
    const existing = await getIntegrationToken(row.provider, account_key);
    settings = existing?.settings ?? {};
  }
  await supabase.from("integration_tokens").upsert(
    {
      provider: row.provider,
      account_key,
      access_token: row.access_token,
      refresh_token: row.refresh_token ?? null,
      expires_at: row.expires_at ?? null,
      connected_at: new Date().toISOString(),
      last_sync_at: row.last_sync_at ?? null,
      sync_status: row.sync_status ?? "idle",
      sync_progress: row.sync_progress ?? null,
      sync_started_at: row.sync_started_at ?? null,
      settings,
    },
    { onConflict: "provider,account_key" }
  );
}

export async function getTokenSettings<T extends Record<string, unknown>>(
  provider: string,
  accountKey = ""
): Promise<T> {
  const token = await getIntegrationToken(provider, accountKey);
  return ((token?.settings ?? {}) as T);
}

export async function updateTokenSettings(
  provider: string,
  settings: Record<string, unknown>,
  accountKey = ""
) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ settings })
    .eq("provider", provider)
    .eq("account_key", accountKey);
}

export async function deleteIntegrationToken(provider: string, accountKey = "") {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .delete()
    .eq("provider", provider)
    .eq("account_key", accountKey);
}

export async function touchLastSync(provider: string, accountKey = "") {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("account_key", accountKey);
}

export async function setSyncRunning(provider: string, accountKey = "") {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({
      sync_status: "running",
      sync_started_at: new Date().toISOString(),
      sync_progress: { phase: "fetching", total: 0, processed: 0, imported: 0 },
    })
    .eq("provider", provider)
    .eq("account_key", accountKey);
}

export async function updateSyncProgress(
  provider: string,
  progress: SyncProgress,
  accountKey = ""
) {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ sync_progress: progress })
    .eq("provider", provider)
    .eq("account_key", accountKey);
}

export async function setSyncCompleted(provider: string, accountKey = "") {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({
      sync_status: "completed",
      sync_progress: null,
      last_sync_at: new Date().toISOString(),
    })
    .eq("provider", provider)
    .eq("account_key", accountKey);
}

export async function setSyncFailed(provider: string, accountKey = "") {
  const supabase = getSupabase();
  await supabase
    .from("integration_tokens")
    .update({ sync_status: "failed", sync_progress: null })
    .eq("provider", provider)
    .eq("account_key", accountKey);
}

export async function tryStartSync(provider: string, accountKey = ""): Promise<boolean> {
  const token = await getIntegrationToken(provider, accountKey);
  if (!token) return false;

  if (token.sync_status === "running" && token.sync_started_at) {
    const started = new Date(token.sync_started_at).getTime();
    if (Date.now() - started < STALE_SYNC_MS) return false;
  }

  await setSyncRunning(provider, accountKey);
  return true;
}

export async function isGoogleConnected() {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  return token != null;
}
