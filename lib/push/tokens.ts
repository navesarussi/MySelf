import { getSupabase } from "@/lib/supabase";
import type { PushPlatform } from "@/lib/push/types";

const EXPO_TOKEN_RE = /^ExponentPushToken\[.+\]$/;

export function isValidExpoPushToken(token: string): boolean {
  return EXPO_TOKEN_RE.test(token.trim());
}

export async function upsertPushToken(input: {
  expoPushToken: string;
  platform: PushPlatform;
  deviceId?: string | null;
}): Promise<{ ok: true }> {
  const token = input.expoPushToken.trim();
  if (!isValidExpoPushToken(token)) throw new Error("invalid_token");
  if (!["ios", "android", "web"].includes(input.platform)) {
    throw new Error("invalid_platform");
  }

  const { error } = await getSupabase().from("push_tokens").upsert(
    {
      expo_push_token: token,
      platform: input.platform,
      device_id: input.deviceId?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" }
  );
  if (error) throw new Error("token_upsert_failed");
  return { ok: true };
}

export async function deletePushToken(expoPushToken: string): Promise<{ ok: true }> {
  const token = expoPushToken.trim();
  if (!token) throw new Error("invalid_token");
  const { error } = await getSupabase()
    .from("push_tokens")
    .delete()
    .eq("expo_push_token", token);
  if (error) throw new Error("token_delete_failed");
  return { ok: true };
}

export async function listPushTokens(): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("push_tokens")
    .select("expo_push_token");
  if (error || !data) return [];
  return data.map((r) => String((r as { expo_push_token: string }).expo_push_token));
}

export async function removePushTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  await getSupabase().from("push_tokens").delete().in("expo_push_token", tokens);
}
