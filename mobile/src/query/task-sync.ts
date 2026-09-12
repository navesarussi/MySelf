import { api } from "../api/resources";
import type { ApiConfig } from "../api/client";
import { pollUntilSyncDone } from "./poll-sync";

type TaskSyncKick = {
  ok: boolean;
  started?: boolean;
  alreadyRunning?: boolean;
  imported?: number;
  markedDone?: number;
};

type SyncPoll = { syncStatus?: "idle" | "running" | "completed" | "failed" };

/** Fire async task-source sync and poll provider status until settled. */
export async function kickoffTaskSourceSync(
  config: ApiConfig,
  kick: () => Promise<TaskSyncKick>,
  poll: (c: ApiConfig) => Promise<SyncPoll>
): Promise<TaskSyncKick> {
  const result = await kick();
  if (!result.ok) return result;
  if (result.started || result.alreadyRunning) {
    await pollUntilSyncDone(config, poll);
    return { ok: true };
  }
  return result;
}

export async function syncGoogleTasksWithPoll(config: ApiConfig): Promise<TaskSyncKick> {
  return kickoffTaskSourceSync(
    config,
    () => api.syncTaskSources(config, "google_tasks"),
    (c) => api.googleTasksStatus(c)
  );
}

export async function syncGithubWithPoll(
  config: ApiConfig,
  listIds?: string[]
): Promise<TaskSyncKick> {
  return kickoffTaskSourceSync(
    config,
    () => api.syncTaskSources(config, "github", listIds?.length ? { list_ids: listIds } : undefined),
    (c) => api.githubStatus(c)
  );
}

export async function syncMondayWithPoll(
  config: ApiConfig,
  accountKey: string,
  listIds?: string[]
): Promise<TaskSyncKick> {
  const pollMonday = async (c: ApiConfig): Promise<SyncPoll> => {
    const { accounts } = await api.mondayAccounts(c);
    const acc = accounts.find((a) => a.account_key === accountKey);
    return { syncStatus: acc?.sync_status ?? "idle" };
  };
  return kickoffTaskSourceSync(
    config,
    () =>
      api.syncTaskSources(config, "monday", {
        account_key: accountKey,
        ...(listIds?.length ? { list_ids: listIds } : {}),
      }),
    pollMonday
  );
}
