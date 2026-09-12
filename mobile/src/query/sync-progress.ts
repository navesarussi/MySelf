import type { SyncProgress } from "../api/resources";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Render a sync progress snapshot as user-facing text.
 * Falls back to the generic "syncing" label whenever there is no countable
 * work yet, so the label never flashes a meaningless "0 of 0".
 */
export function formatSyncProgress(t: Translate, progress: SyncProgress | null): string {
  if (!progress) return t("settings.syncing");

  switch (progress.phase) {
    case "fetching":
      return t("settings.syncFetching");
    case "upserting":
      return progress.total > 0
        ? t("settings.syncProgressTasks", {
            processed: progress.processed,
            total: progress.total,
          })
        : t("settings.syncing");
    case "cleanup":
      return t("settings.syncFinishing");
    default:
      return t("settings.syncing");
  }
}
