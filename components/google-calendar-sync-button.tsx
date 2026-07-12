"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/components/locale-provider";
import type { SyncProgress, SyncStatus } from "@/lib/types";

type SyncStatusResponse = {
  syncStatus: SyncStatus;
  syncProgress: SyncProgress | null;
  lastSyncAt: string | null;
  eventCount: number;
};

type Props = {
  initialSyncStatus?: SyncStatus;
  onComplete?: () => void;
  onStatusUpdate?: (data: SyncStatusResponse) => void;
  className?: string;
};

export function GoogleCalendarSyncButton({
  initialSyncStatus = "idle",
  onComplete,
  onStatusUpdate,
  className = "",
}: Props) {
  const { t } = useTranslations();
  const router = useRouter();
  const [syncing, setSyncing] = useState(initialSyncStatus === "running");
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const applyStatus = useCallback((data: SyncStatusResponse) => {
    setProgress(data.syncProgress);
    setSyncing(data.syncStatus === "running");
    onStatusUpdate?.(data);
    return data.syncStatus;
  }, [onStatusUpdate]);

  const pollStatus = useCallback(async () => {
    const res = await fetch("/api/integrations/google/sync/status");
    if (!res.ok) return "failed" as SyncStatus;
    const data = (await res.json()) as SyncStatusResponse;
    return applyStatus(data);
  }, [applyStatus]);

  useEffect(() => {
    if (initialSyncStatus !== "running") return;
    setSyncing(true);
    void pollStatus();
  }, [initialSyncStatus, pollStatus]);

  useEffect(() => {
    if (!syncing) return;

    const id = setInterval(async () => {
      const status = await pollStatus();
      if (status !== "running") {
        clearInterval(id);
        if (status === "completed" || status === "failed") {
          onComplete?.();
          router.refresh();
        }
      }
    }, 2000);

    return () => clearInterval(id);
  }, [syncing, pollStatus, router, onComplete]);

  async function handleSync() {
    setSyncing(true);
    const res = await fetch("/api/integrations/google/sync", { method: "POST" });
    if (!res.ok) {
      setSyncing(false);
      return;
    }
    const data = (await res.json()) as { started?: boolean; alreadyRunning?: boolean };
    if (data.started || data.alreadyRunning) {
      await pollStatus();
      return;
    }
    setSyncing(false);
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {syncing && progress && progress.total > 0 && (
        <span className="text-xs text-muted">
          {t("settings.syncProgress", { processed: progress.processed, total: progress.total })}
        </span>
      )}
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {syncing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {syncing ? t("settings.syncing") : t("common.syncNow")}
      </button>
    </div>
  );
}
