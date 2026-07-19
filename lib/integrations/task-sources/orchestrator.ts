import { getSupabase } from "@/lib/supabase";
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
import { buildExternalTaskUpsert, idsToMarkDone } from "./merge";
import { MONDAY_PROVIDER } from "../monday-config";

const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

async function fetchExistingExternalTaskIds(
  providerId: TaskSourceId,
  accountKeyPrefix?: string
) {
  const supabase = getSupabase();
  const byExternalId = new Map<string, string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from("tasks")
      .select("id, external_id")
      .eq("source", providerId)
      .not("external_id", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (accountKeyPrefix) {
      query = query.like("external_id", `${accountKeyPrefix}:%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`sync_fetch_existing_failed:${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      if (row.external_id) byExternalId.set(row.external_id, row.id);
    }
    if (data.length < PAGE_SIZE) break;
  }

  return byExternalId;
}

async function syncSingleAccount(
  providerId: TaskSourceId,
  accountKey: string,
  pull: (selectedListIds: string[]) => Promise<
    Parameters<typeof buildExternalTaskUpsert>[0][]
  >
): Promise<{ imported: number; markedDone: number; alreadyRunning?: true }> {
  const started = await tryStartSync(providerId, accountKey);
  if (!started) return { imported: 0, markedDone: 0, alreadyRunning: true as const };

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
    const selectedListIds = settings.selected_list_ids ?? [];
    const drafts = selectedListIds.length ? await pull(selectedListIds) : [];
    const now = new Date().toISOString();
    const fetchedIds = new Set(drafts.map((d) => d.externalId));

    await updateSyncProgress(
      providerId,
      { phase: "upserting", total: drafts.length, processed: 0, imported: 0 },
      accountKey
    );

    const supabase = getSupabase();
    const existingByExternalId = await fetchExistingExternalTaskIds(
      providerId,
      providerId === MONDAY_PROVIDER ? accountKey : undefined
    );
    let imported = 0;

    for (let i = 0; i < drafts.length; i += BATCH_SIZE) {
      const chunk = drafts.slice(i, i + BATCH_SIZE);

      for (const draft of chunk) {
        const row = buildExternalTaskUpsert(draft, providerId, now);
        const existingId = existingByExternalId.get(draft.externalId);

        if (existingId) {
          const { error } = await supabase.from("tasks").update(row).eq("id", existingId);
          if (error) throw new Error(`sync_update_failed:${error.message}`);
        } else {
          const { data, error } = await supabase.from("tasks").insert(row).select("id").single();
          if (error) throw new Error(`sync_insert_failed:${error.message}`);
          if (data?.id) existingByExternalId.set(draft.externalId, data.id);
        }
      }

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

    let localQuery = supabase
      .from("tasks")
      .select("external_id")
      .eq("source", providerId)
      .eq("status", "open")
      .not("external_id", "is", null);

    if (providerId === MONDAY_PROVIDER && accountKey) {
      localQuery = localQuery.like("external_id", `${accountKey}:%`);
    }

    const { data: localOpenRows, error: fetchError } = await localQuery;
    if (fetchError) throw new Error(`sync_fetch_local_failed:${fetchError.message}`);

    const localOpenExternalIds = (localOpenRows ?? [])
      .map((row) => row.external_id)
      .filter((id): id is string => id !== null);

    const toMarkDone = idsToMarkDone(localOpenExternalIds, fetchedIds);
    let markedDone = 0;
    if (toMarkDone.length > 0) {
      const { error: updateError } = await supabase
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

export async function syncTaskSource(
  providerId: TaskSourceId
): Promise<{ imported: number; markedDone: number; alreadyRunning?: true; notConnected?: true }> {
  if (providerId === MONDAY_PROVIDER) {
    const accounts = await listIntegrationTokens(MONDAY_PROVIDER);
    if (!accounts.length) return { imported: 0, markedDone: 0, notConnected: true as const };

    let imported = 0;
    let markedDone = 0;
    let anyRunning = false;

    for (const account of accounts) {
      const provider = createMondayProvider(account.account_key);
      const result = await syncSingleAccount(providerId, account.account_key, (ids) =>
        provider.pullOpenTasks(ids)
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

  return syncSingleAccount(providerId, "", (ids) => provider.pullOpenTasks(ids));
}

export async function syncAllTaskSources(): Promise<
  Record<TaskSourceId, { imported: number; markedDone: number; error?: string }>
> {
  const supabase = getSupabase();
  const { data: tokens } = await supabase
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
