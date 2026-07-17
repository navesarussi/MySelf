"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { GoogleCalendarSyncButton } from "@/components/google-calendar-sync-button";
import { useTranslations } from "@/components/locale-provider";
import { formatLocaleDateTime } from "@/lib/i18n/core";
import type { SyncStatus } from "@/lib/types";

type Props = {
  connected: boolean;
  lastSyncAt: string | null;
  initialSyncStatus: SyncStatus;
};

export function TimelineSyncBar({ connected, lastSyncAt, initialSyncStatus }: Props) {
  const { locale, t } = useTranslations();
  const [lastSync, setLastSync] = useState(lastSyncAt);

  const onStatusUpdate = useCallback((data: { lastSyncAt: string | null }) => {
    if (data.lastSyncAt) setLastSync(data.lastSyncAt);
  }, []);

  if (!connected) {
    return (
      <p className="mb-3 text-xs text-muted">
        <Link href="/legacy/settings" className="text-accent hover:underline">
          {t("timeline.connectGoogle")}
        </Link>{" "}
        {t("timeline.importHint")}
      </p>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-xs">
      <span className="text-muted">
        {t("timeline.lastSynced")}: {formatLocaleDateTime(locale, lastSync)}
      </span>
      <GoogleCalendarSyncButton
        compact
        initialSyncStatus={initialSyncStatus}
        onStatusUpdate={onStatusUpdate}
      />
    </div>
  );
}
