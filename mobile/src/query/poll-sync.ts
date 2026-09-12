import type { ApiConfig } from "../api/client";
import type { SyncProgress } from "../api/resources";

export type SyncPollPayload = {
  syncStatus?: "idle" | "running" | "completed" | "failed";
  syncProgress?: SyncProgress | null;
};

const POLL_MS = 1500;
const TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll integration sync status until it leaves the running state, reporting
 * each observed progress snapshot so callers can render live feedback.
 */
export async function pollUntilSyncDone<T extends SyncPollPayload>(
  config: ApiConfig,
  fetchStatus: (c: ApiConfig) => Promise<T>,
  onProgress?: (progress: SyncProgress | null) => void
): Promise<T> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await fetchStatus(config);
    onProgress?.(status.syncProgress ?? null);
    if (status.syncStatus !== "running") return status;
    await sleep(POLL_MS);
  }
  throw new Error("sync_timeout");
}
