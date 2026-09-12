import { useCallback, useMemo, useState } from "react";
import type { SyncProgress } from "../api/resources";
import { formatSyncProgress } from "../query/sync-progress";
import { useI18n } from "../i18n";

/**
 * Tracks the progress snapshots reported by pollUntilSyncDone and exposes them
 * as a ready-to-render label. Pass `onProgress` to a *WithPoll sync helper.
 */
export function useSyncProgress() {
  const { t } = useI18n();
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const onProgress = useCallback((next: SyncProgress | null) => setProgress(next), []);
  const reset = useCallback(() => setProgress(null), []);
  const text = useMemo(() => formatSyncProgress(t, progress), [t, progress]);

  return { progress, onProgress, reset, text };
}
