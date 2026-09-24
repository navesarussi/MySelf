import { getSupabase } from "@/lib/supabase";
import { userDb } from "@/lib/db/user-db";
import { fetchAllRows } from "@/lib/db/paginate";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import type { TaskSourceId } from "./types";
import { getTaskSourceProvider } from "./registry";
import { createMondayProvider } from "./monday/provider";
import {
  getIntegrationToken,
  listIntegrationTokens,
  tryStartSync,
  setSyncCompleted,
  setSyncFailed,
  getTokenSettings,
  updateSyncProgress,
} from "../tokens";
import { buildExternalTaskUpsert, dedupeDraftsByExternalId, idsToMarkDone } from "./merge";
import { MONDAY_PROVIDER } from "../monday-config";

const BATCH_SIZE = 100;

/**
 * Every existing task of this provider, so the upsert can preserve the local
 * status and priority instead of letting the provider overwrite them.
 *
 * Ordered by id: `range()` over an unordered query is not stable in Postgres,
 * so pages could repeat rows and skip others. A skipped row is a task whose
 * local status and priority were silently reset on the next sync.
 */
async function fetchExistingExternalTaskIds(
  providerId: TaskSourceId,
  accountKeyPrefix?: string
) {
  const supabase = getSupabase();
  const db = await userDb();
  const rows = await fetchAllRows<{ id: string; external_id: string | null; status: string; priority: string }>(
    async (from, to) => {
      let query = db
        .from("tasks")
        .select("id, external_id, status, priority")
        .eq("source", providerId)
        .not("external_id", "is", null)
        .order("id")
        .range(from, to);
      if (accountKeyPrefix) query = query.like("external_id", `${accountKeyPrefix}:%`);
      const { data, error } = await query;
      return { data, error: error ? { message: `sync_fetch_existing_failed:${error.message}` } : null };
    }
  );

  const byExternalId = new Map<string, { id: string; status: string; priority: string }>();
  for (const row of rows) {
    if (row.external_id) {
      byExternalId.set(row.external_id, { id: row.id, status: row.status, priority: row.priority });
    }
  }
  return byExternalId;
}

async function syncSingleAccount(
  providerId: TaskSourceId,
  accountKey: string,
  pull: (selectedListIds: string[]) => Promise<
    Parameters<typeof buildExternalTaskUpsert>[0][]
  >,
  listIdsOverride?: string[],
  preStarted?: boolean
): Promise<{ imported: number; markedDone: number; alreadyRunning?: true }> {
  if (!preStarted) {
    const started = await tryStartSync(providerId, accountKey);
    if (!started) return { imported: 0, markedDone: 0, alreadyRunning: true as const };
  }

  try {
    await updateSyncProgress(
      providerId,
      { phase: "fetching", total: 0, processed: 0, imported: 0 },
      accountKey
    );

    const settings = await getTokenSettings<{ selected_list_ids?: string[] }>(
      providerId,
      accountKey
    );
    const selectedListIds =
      listIdsOverride ?? settings.selected_list_ids ?? [];
    const pulled = selectedListIds.length ? await pull(selectedListIds) : [];
    const drafts = dedupeDraftsByExternalId(pulled);
    const now = new Date().toISOString();
    const fetchedIds = new Set(drafts.map((d) => d.externalId));

    await updateSyncProgress(
      providerId,
      { phase: "upserting", total: drafts.length, processed: 0, imported: 0 },
      accountKey
    );

    const supabase = getSupabase();

    const db = await userDb();
    const existingByExternalId = await fetchExistingExternalTaskIds(
      providerId,
      providerId === MONDAY_PROVIDER ? accountKey : undefined
    );
    let imported = 0;

    // One upsert per chunk instead of a round-trip per task: the (source,
    // external_id) unique constraint lets Postgres decide insert vs update, and
    // each row already carries its merged status/priority from the fetch above.
    for (let i = 0; i < drafts.length; i += BATCH_SIZE) {
      const chunk = drafts.slice(i, i + BATCH_SIZE);
      const rows = chunk.map((draft) => {
        const existing = existingByExternalId.get(draft.externalId);
        return buildExternalTaskUpsert(
          draft,
          providerId,
          now,
          existing
            ? {
                status: existing.status as TaskStatus,
                priority: existing.priority as TaskPriority,
              }
            : undefined
        );
      });

      const { error } = await db
        .from("tasks")
        .upsert(rows, { onConflict: "user_id,source,external_id" });
      if (error) throw new Error(`sync_upsert_failed:${error.message}`);

      imported += chunk.length;
      await updateSyncProgress(
        providerId,
        {
          phase: "upserting",
          total: drafts.length,
          processed: imported,
          imported,
        },
        accountKey
      );
    }

    await updateSyncProgress(
      providerId,
      {
        phase: "cleanup",
        total: drafts.length,
        processed: drafts.length,
        imported,
      },
      accountKey
    );

    // Paged and ordered for the same reason as above: a single unpaged request
    // stops at PostgREST's row cap, so every open task past it was invisible
    // here and never got closed when the provider dropped it.
    const localOpenRows = await fetchAllRows<{ external_id: string | null }>(async (from, to) => {
      let localQuery = db
        .from("tasks")
        .select("external_id")
        .eq("source", providerId)
        .neq("status", "done")
        .not("external_id", "is", null)
        .order("id")
        .range(from, to);

      if (providerId === MONDAY_PROVIDER && accountKey) {
        localQuery = localQuery.like("external_id", `${accountKey}:%`);
      }
      if (listIdsOverride?.length) {
        localQuery = localQuery.in("external_list_id", listIdsOverride);
      }
      const { data, error } = await localQuery;
      return { data, error: error ? { message: `sync_fetch_local_failed:${error.message}` } : null };
    });

    const localOpenExternalIds = localOpenRows
      .map((row) => row.external_id)
      .filter((id): id is string => id !== null);

    const toMarkDone = idsToMarkDone(localOpenExternalIds, fetchedIds);
    let markedDone = 0;
    if (toMarkDone.length > 0) {
      const { error: updateError } = await db
        .from("tasks")
        .update({ status: "done", updated_at: now })
        .eq("source", providerId)
        .in("external_id", toMarkDone);
      if (updateError) throw new Error(`sync_mark_done_failed:${updateError.message}`);
      markedDone = toMarkDone.length;
    }

    await setSyncCompleted(providerId, accountKey);
    return { imported, markedDone };
  } catch (err) {
    await setSyncFailed(providerId, accountKey);
    throw err;
  }
}

export type SyncTaskSourceOptions = {
  accountKey?: string;
  listIds?: string[];
  /** Monday only: sync exactly these accounts (the caller already claimed them). */
  accountKeys?: string[];
  /** The caller already marked the token(s) running via tryStartSync. */
  preStarted?: boolean;
};

export async function syncTaskSource(
  providerId: TaskSourceId,
  opts?: SyncTaskSourceOptions
): Promise<{ imported: number; markedDone: number; alreadyRunning?: true; notConnected?: true }> {
  if (providerId === MONDAY_PROVIDER) {
    const accounts = await listIntegrationTokens(MONDAY_PROVIDER);
    if (!accounts.length) return { imported: 0, markedDone: 0, notConnected: true as const };

    const claimed = opts?.accountKeys;
    const scoped = claimed?.length
      ? accounts.filter((a) => claimed.includes(a.account_key))
      : opts?.accountKey
        ? accounts.filter((a) => a.account_key === opts.accountKey)
        : accounts;
    if (!scoped.length) return { imported: 0, markedDone: 0, notConnected: true as const };

    let imported = 0;
    let markedDone = 0;
    let anyRunning = false;

    for (const account of scoped) {
      const provider = createMondayProvider(account.account_key);
      const result = await syncSingleAccount(
        providerId,
        account.account_key,
        (ids) => provider.pullOpenTasks(ids),
        opts?.listIds,
        opts?.preStarted
      );
      if (result.alreadyRunning) anyRunning = true;
      imported += result.imported;
      markedDone += result.markedDone;
    }

    if (anyRunning && imported === 0 && markedDone === 0) {
      return { imported: 0, markedDone: 0, alreadyRunning: true as const };
    }
    return { imported, markedDone };
  }

  const provider = getTaskSourceProvider(providerId);
  if (!provider) throw new Error("unknown_provider");

  const token = await getIntegrationToken(providerId);
  if (!token) return { imported: 0, markedDone: 0, notConnected: true as const };

  return syncSingleAccount(
    providerId,
    "",
    (ids) => provider.pullOpenTasks(ids),
    opts?.listIds,
    opts?.preStarted
  );
}

export async function syncAllTaskSources(): Promise<
  Record<TaskSourceId, { imported: number; markedDone: number; error?: string }>
> {
  const supabase = getSupabase();
  const db = await userDb();
  const { data: tokens } = await db
    .from("integration_tokens")
    .select("provider")
    .in("provider", ["google_tasks", "monday", "github"]);

  const providers = Array.from(
    new Set((tokens ?? []).map((t) => t.provider as TaskSourceId))
  );
  const results: Record<string, { imported: number; markedDone: number; error?: string }> = {};

  for (const id of providers) {
    try {
      results[id] = await syncTaskSource(id);
    } catch (err) {
      results[id] = {
        imported: 0,
        markedDone: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return results;
}
