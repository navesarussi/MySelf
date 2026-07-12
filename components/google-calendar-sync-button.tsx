"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
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
  compact?: boolean;
  className?: string;
};

export function GoogleCalendarSyncButton({
  initialSyncStatus = "idle",
  onComplete,
  onStatusUpdate,
  compact = false,
  className = "",
}: Props) {
  const { t } = useTranslations();
  const router = useRouter();
  const [syncing, setSyncing] = useState(initialSyncStatus === "running");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyStatus = useCallback(
    (data: SyncStatusResponse) => {
      setProgress(data.syncProgress);
      setSyncing(data.syncStatus === "running");
      onStatusUpdate?.(data);
      return data.syncStatus;
    },
    [onStatusUpdate]
  );

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
        if (status === "completed") {
          setError(null);
          onComplete?.();
          router.refresh();
        } else if (status === "failed") {
          setError(t("settings.syncFailed"));
        }
      }
    }, 1500);

    return () => clearInterval(id);
  }, [syncing, pollStatus, router, onComplete, t]);

  async function handleSync() {
    setSyncing(true);
    setError(null);

    const pollId = setInterval(() => {
      void pollStatus();
    }, 1500);

    try {
      const res = await fetch("/api/integrations/google/sync", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        alreadyRunning?: boolean;
        error?: string;
        imported?: number;
      };

      clearInterval(pollId);
      await pollStatus();

      if (!res.ok || !data.ok) {
        setSyncing(false);
        setError(data.error ?? t("settings.syncFailed"));
        return;
      }

      if (data.alreadyRunning) return;

      setSyncing(false);
      setError(null);
      onComplete?.();
      router.refresh();
    } catch {
      clearInterval(pollId);
      setSyncing(false);
      setError(t("settings.syncFailed"));
    }
  }

  const btnClass = compact
    ? "inline-flex items-center gap-1.5 rounded-full border border-border bg-bg/60 px-2.5 py-1 text-xs text-muted transition hover:border-accent hover:text-accent disabled:opacity-60"
    : "inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {syncing && progress && progress.total > 0 && (
        <span className="text-xs text-muted">
          {t("settings.syncProgress", { processed: progress.processed, total: progress.total })}
        </span>
      )}
      {error && <span className="text-xs text-warn">{error}</span>}
      <button type="button" onClick={handleSync} disabled={syncing} className={btnClass}>
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {syncing ? t("settings.syncing") : t("common.syncNow")}
      </button>
    </div>
  );
}
