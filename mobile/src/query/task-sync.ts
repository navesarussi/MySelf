import { api } from "../api/resources";
import type { ApiConfig } from "../api/client";
import { pollUntilSyncDone } from "./poll-sync";
import type { SyncProgress } from "../api/resources";

type TaskSyncKick = {
  ok: boolean;
  started?: boolean;
  alreadyRunning?: boolean;
  imported?: number;
  markedDone?: number;
};

type SyncPoll = {
  syncStatus?: "idle" | "running" | "completed" | "failed";
  syncProgress?: SyncProgress | null;
};

export type SyncProgressHandler = (progress: SyncProgress | null) => void;

/** Fire async task-source sync and poll provider status until settled. */
export async function kickoffTaskSourceSync(
  config: ApiConfig,
  kick: () => Promise<TaskSyncKick>,
  poll: (c: ApiConfig) => Promise<SyncPoll>,
  onProgress?: SyncProgressHandler
): Promise<TaskSyncKick> {
  const result = await kick();
  if (!result.ok) return result;
  if (result.started || result.alreadyRunning) {
    await pollUntilSyncDone(config, poll, onProgress);
    return { ok: true };
  }
  return result;
}

export async function syncGoogleTasksWithPoll(
  config: ApiConfig,
  onProgress?: SyncProgressHandler
): Promise<TaskSyncKick> {
  return kickoffTaskSourceSync(
    config,
    () => api.syncTaskSources(config, "google_tasks"),
    (c) => api.googleTasksStatus(c),
    onProgress
  );
}

export async function syncGithubWithPoll(
  config: ApiConfig,
  listIds?: string[],
  onProgress?: SyncProgressHandler
): Promise<TaskSyncKick> {
  return kickoffTaskSourceSync(
    config,
    () => api.syncTaskSources(config, "github", listIds?.length ? { list_ids: listIds } : undefined),
    (c) => api.githubStatus(c),
    onProgress
  );
}

export async function syncMondayWithPoll(
  config: ApiConfig,
  accountKey: string,
  listIds?: string[],
  onProgress?: SyncProgressHandler
): Promise<TaskSyncKick> {
  const pollMonday = async (c: ApiConfig): Promise<SyncPoll> => {
    const { accounts } = await api.mondayAccounts(c);
    const acc = accounts.find((a) => a.account_key === accountKey);
    return {
      syncStatus: acc?.sync_status ?? "idle",
      syncProgress: acc?.sync_progress ?? null,
    };
  };
  return kickoffTaskSourceSync(
    config,
    () =>
      api.syncTaskSources(config, "monday", {
        account_key: accountKey,
        ...(listIds?.length ? { list_ids: listIds } : {}),
      }),
    pollMonday,
    onProgress
  );
}
