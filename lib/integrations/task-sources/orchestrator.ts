import { getSupabase } from "@/lib/supabase";
import type { TaskSourceId } from "./types";
import { getTaskSourceProvider } from "./registry";
import {
  getIntegrationToken,
  tryStartSync,
  setSyncCompleted,
  setSyncFailed,
  getTokenSettings,
  updateSyncProgress,
} from "../tokens";
import { buildExternalTaskUpsert, idsToMarkDone } from "./merge";

const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

async function fetchExistingExternalTaskIds(providerId: TaskSourceId) {
  const supabase = getSupabase();
  const byExternalId = new Map<string, string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, external_id")
      .eq("source", providerId)
      .not("external_id", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`sync_fetch_existing_failed:${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      if (row.external_id) byExternalId.set(row.external_id, row.id);
    }
    if (data.length < PAGE_SIZE) break;
  }

  return byExternalId;
}

export async function syncTaskSource(
  providerId: TaskSourceId
): Promise<{ imported: number; markedDone: number; alreadyRunning?: true; notConnected?: true }> {
  const provider = getTaskSourceProvider(providerId);
  if (!provider) throw new Error("unknown_provider");

  const token = await getIntegrationToken(providerId);
  if (!token) return { imported: 0, markedDone: 0, notConnected: true as const };

  const started = await tryStartSync(providerId);
  if (!started) return { imported: 0, markedDone: 0, alreadyRunning: true as const };

  try {
    await updateSyncProgress(providerId, {
      phase: "fetching",
      total: 0,
      processed: 0,
      imported: 0,
    });

    const settings = await getTokenSettings<{ selected_list_ids?: string[] }>(providerId);
    const selectedListIds = settings.selected_list_ids ?? [];

    const drafts = selectedListIds.length
      ? await provider.pullOpenTasks(selectedListIds)
      : [];

    const now = new Date().toISOString();
    const fetchedIds = new Set(drafts.map((d) => d.externalId));

    await updateSyncProgress(providerId, {
      phase: "upserting",
      total: drafts.length,
      processed: 0,
      imported: 0,
    });

    const supabase = getSupabase();
    let imported = 0;

    if (providerId !== "google_tasks") {
      throw new Error("unsupported_provider_upsert");
    }

    const existingByExternalId = await fetchExistingExternalTaskIds(providerId);

    for (let i = 0; i < drafts.length; i += BATCH_SIZE) {
      const chunk = drafts.slice(i, i + BATCH_SIZE);

      for (const draft of chunk) {
        const row = buildExternalTaskUpsert(draft, "google_tasks", now);
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
      await updateSyncProgress(providerId, {
        phase: "upserting",
        total: drafts.length,
        processed: imported,
        imported,
      });
    }

    await updateSyncProgress(providerId, {
      phase: "cleanup",
      total: drafts.length,
      processed: drafts.length,
      imported,
    });

    const { data: localOpenRows, error: fetchError } = await supabase
      .from("tasks")
      .select("external_id")
      .eq("source", providerId)
      .eq("status", "open")
      .not("external_id", "is", null);

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

    await setSyncCompleted(providerId);
    return { imported, markedDone };
  } catch (err) {
    await setSyncFailed(providerId);
    throw err;
  }
}

export async function syncAllTaskSources(): Promise<
  Record<TaskSourceId, { imported: number; markedDone: number; error?: string }>
> {
  const supabase = getSupabase();
  const { data: tokens } = await supabase
    .from("integration_tokens")
    .select("provider")
    .in("provider", ["google_tasks", "monday", "github"]);

  const providers = (tokens ?? []).map((t) => t.provider as TaskSourceId);
  const results: Record<string, { imported: number; markedDone: number; error?: string }> = {};

  for (const providerId of providers) {
    try {
      const result = await syncTaskSource(providerId);
      results[providerId] = result;
    } catch (err) {
      results[providerId] = {
        imported: 0,
        markedDone: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return results;
}
