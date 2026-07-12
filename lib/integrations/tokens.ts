import { getSupabase } from "@/lib/supabase";
import type { IntegrationToken } from "@/lib/types";
import { GOOGLE_PROVIDER } from "./google-config";

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
  row: Omit<IntegrationToken, "connected_at" | "last_sync_at"> & {
    last_sync_at?: string | null;
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

export async function isGoogleConnected() {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  return token != null;
}
