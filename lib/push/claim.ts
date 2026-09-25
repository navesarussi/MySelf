import { userDb } from "@/lib/db/user-db";
import type { NotificationType } from "@/lib/push/types";

/**
 * Same-day send dedupe, as a claim rather than a check.
 *
 * `notifyUser` used to read the log, send the push, and only then write the log
 * row — so two overlapping runs (a retried cron, a concurrent dispatch) both
 * read "not sent yet" and both pushed. The unique index on
 * (notif_type, ref_id, day_key) was already there; it just was not being used
 * as the gate. Inserting first and sending only on a successful insert makes
 * the database decide, which is the only place that can decide correctly.
 */

type UpsertBuilder = {
  select(columns?: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

type DeleteBuilder = {
  eq(column: string, value: unknown): DeleteBuilder;
  select(columns?: string): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
};

export type SendLogClient = {
  from(table: string): {
    upsert(row: Record<string, unknown>, opts?: Record<string, unknown>): UpsertBuilder;
    delete(): DeleteBuilder;
  };
};

const TABLE = "notification_log";

export type SendLogEntry = {
  type: NotificationType;
  refId: string;
  dayKey: string;
  title: string;
  body: string;
};

/**
 * Take today's slot for this notification. True means this caller — and only
 * this caller — may send it. A write failure returns false: a broken log is a
 * reason not to send, since nothing would then stop the next run repeating it.
 */
export async function claimSend(client: SendLogClient, entry: SendLogEntry): Promise<boolean> {
  const { data, error } = await client
    .from(TABLE)
    .upsert(
      {
        notif_type: entry.type,
        ref_id: entry.refId,
        day_key: entry.dayKey,
        title: entry.title,
        body: entry.body,
      },
      { onConflict: "user_id,notif_type,ref_id,day_key", ignoreDuplicates: true }
    )
    // With ignoreDuplicates, select() returns only the rows actually inserted.
    .select("id");
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/** Give the slot back when the push reached nobody, so a retry can still send. */
export async function releaseSend(client: SendLogClient, entry: SendLogEntry): Promise<void> {
  await client
    .from(TABLE)
    .delete()
    .eq("notif_type", entry.type)
    .eq("ref_id", entry.refId)
    .eq("day_key", entry.dayKey)
    .select("id");
}

/** The current account's send log. */
export const sendLogClient = async (): Promise<SendLogClient> =>
  (await userDb()) as unknown as SendLogClient;
