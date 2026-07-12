import Link from "next/link";
import { getIntegrationToken, isGoogleConnected } from "@/lib/integrations/tokens";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { GoogleCalendarSyncButton } from "@/components/google-calendar-sync-button";
import { formatLocaleDateTime, getTranslations } from "@/lib/i18n";

export async function TimelineSyncBar() {
  const { locale, t } = await getTranslations();
  const connected = await isGoogleConnected();

  if (!connected) {
    return (
      <p className="mb-4 text-sm text-muted">
        <Link href="/settings" className="text-accent hover:underline">
          {t("timeline.connectGoogle")}
        </Link>{" "}
        {t("timeline.importHint")}
      </p>
    );
  }

  const token = await getIntegrationToken(GOOGLE_PROVIDER);

  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <span className="text-muted">
        {t("timeline.lastSynced")}: {formatLocaleDateTime(locale, token?.last_sync_at ?? null)}
      </span>
      <GoogleCalendarSyncButton initialSyncStatus={token?.sync_status ?? "idle"} />
    </div>
  );
}
