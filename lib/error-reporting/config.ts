import { getSupabase } from "@/lib/supabase";

type WebhookConfig = { url: string; key: string } | null;

let cached: WebhookConfig | undefined;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000;

function fromEnv(): WebhookConfig {
  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  const key = process.env.ERROR_WEBHOOK_KEY?.trim();
  if (url && key) return { url, key };
  return null;
}

async function fromDb(): Promise<WebhookConfig> {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from("system_config")
      .select("key, value")
      .in("key", ["error_webhook_url", "error_webhook_key"]);
    if (error || !data?.length) return null;
    const map = new Map(data.map((row) => [row.key, row.value]));
    const url = map.get("error_webhook_url")?.trim();
    const key = map.get("error_webhook_key")?.trim();
    if (url && key) return { url, key };
    return null;
  } catch {
    return null;
  }
}

export async function getWebhookConfig(force = false): Promise<WebhookConfig> {
  const env = fromEnv();
  if (env) return env;

  const now = Date.now();
  if (!force && cached !== undefined && now - cachedAt < CACHE_MS) {
    return cached;
  }

  cached = await fromDb();
  cachedAt = now;
  return cached;
}

/** Test helper — reset in-memory cache between cases. */
export function resetWebhookConfigCache(): void {
  cached = undefined;
  cachedAt = 0;
}
