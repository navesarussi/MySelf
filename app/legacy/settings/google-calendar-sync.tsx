"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "@/components/locale-provider";
import { formatLocaleDateTime } from "@/lib/i18n/core";
import type { SyncStatus } from "@/lib/types";
import { GoogleCalendarSyncButton } from "@/components/google-calendar-sync-button";

type Props = {
  lastSyncAt: string | null;
  calendarEventCount: number;
  initialSyncStatus: SyncStatus;
  disconnectAction: () => Promise<void>;
};

export function GoogleCalendarSyncPanel({
  lastSyncAt,
  calendarEventCount,
  initialSyncStatus,
  disconnectAction,
}: Props) {
  const { locale, t } = useTranslations();
  const [lastSync, setLastSync] = useState(lastSyncAt);
  const [eventCount, setEventCount] = useState(calendarEventCount);

  const onStatusUpdate = useCallback((data: { lastSyncAt: string | null; eventCount: number }) => {
    if (data.lastSyncAt) setLastSync(data.lastSyncAt);
    setEventCount(data.eventCount);
  }, []);

  return (
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-good">{t("settings.connected")}</p>
      <p className="text-muted">
        {t("settings.lastSync")}: {formatLocaleDateTime(locale, lastSync)}
      </p>
      <p className="text-muted">
        {t("settings.importedEvents")}: {eventCount}
      </p>
      <p className="text-xs text-muted">{t("settings.autoSync")}</p>

      <GoogleCalendarSyncButton
        initialSyncStatus={initialSyncStatus}
        onStatusUpdate={onStatusUpdate}
      />

      <form action={disconnectAction}>
        <button type="submit" className="text-sm text-warn hover:underline">
          {t("settings.disconnect")}
        </button>
      </form>
    </div>
  );
}
