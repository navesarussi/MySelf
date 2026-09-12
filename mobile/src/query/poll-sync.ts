import type { SyncStatusPayload } from "../api/resources";
import type { ApiConfig } from "../api/client";

const POLL_MS = 1500;
const TIMEOUT_MS = 5 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll integration sync status until it leaves the running state. */
export async function pollUntilSyncDone(
  config: ApiConfig,
  fetchStatus: (c: ApiConfig) => Promise<SyncStatusPayload>
): Promise<SyncStatusPayload> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await fetchStatus(config);
    if (status.syncStatus !== "running") return status;
    await sleep(POLL_MS);
  }
  throw new Error("sync_timeout");
}
