const WHATSAPP_DEDUP_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_whatsapp_inbound_external_id_uidx
  ON myself.agent_messages (external_id)
  WHERE external_id IS NOT NULL
    AND direction = 'inbound'
    AND channel = 'whatsapp';
`;

function postgresUrl(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null
  );
}

/** Apply WhatsApp inbound dedup index (idempotent). Requires direct Postgres URL on Vercel. */
export async function ensureAgentWhatsAppDedupSchema(): Promise<{ ok: boolean; reason: string }> {
  const url = postgresUrl();
  if (!url) return { ok: false, reason: "no_postgres_url" };

  try {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: url,
      ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();
    try {
      await client.query(WHATSAPP_DEDUP_INDEX_SQL);
      await client.query("NOTIFY pgrst, 'reload schema';");
    } finally {
      await client.end();
    }
    return { ok: true, reason: "applied" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "schema_failed";
    console.error("[db-admin] whatsapp_dedup_index", msg);
    return { ok: false, reason: msg };
  }
}

let schemaSyncStarted = false;

/** Fire-and-forget schema sync (once per warm serverless instance). */
export function scheduleAgentWhatsAppDedupSchema(): void {
  if (schemaSyncStarted) return;
  schemaSyncStarted = true;
  void ensureAgentWhatsAppDedupSchema().catch((err) => {
    console.error("[db-admin] schedule_failed", err instanceof Error ? err.message : err);
  });
}
