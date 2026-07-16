import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { getTranslations } from "@/lib/i18n";
import { googleConfigured } from "@/lib/integrations/google-config";
import { getIntegrationToken, isGoogleConnected } from "@/lib/integrations/tokens";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { disconnectGoogle } from "./actions";
import { GoogleCalendarSyncPanel } from "./google-calendar-sync";
import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getTranslations();

  const languageSection = (
    <section className="card mb-3 p-3">
      <h2 className="text-sm font-semibold">{t("language.label")}</h2>
      <p className="mt-1 text-xs text-muted">{t("language.hint")}</p>
      <div className="mt-3">
        <LanguageSwitcher />
      </div>
    </section>
  );

  const versionSection = (
    <section className="card mb-3 p-3">
      <h2 className="text-sm font-semibold">{t("settings.appVersion")}</h2>
      <p className="mt-2 text-sm font-medium">{t("settings.versionValue", { version: APP_VERSION })}</p>
    </section>
  );

  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
        {languageSection}
        {versionSection}
        <DbWarning />
      </>
    );
  }

  const googleReady = googleConfigured();
  const connected = googleReady ? await isGoogleConnected() : false;
  const token = connected ? await getIntegrationToken(GOOGLE_PROVIDER) : null;

  let calendarEventCount = 0;
  if (connected) {
    const supabase = getSupabase();
    const { count } = await supabase
      .from("timeline_events")
      .select("id", { count: "exact", head: true })
      .eq("source", "google_calendar");
    calendarEventCount = count ?? 0;
  }

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      {languageSection}
      {versionSection}

      <section className="card p-3">
        <h2 className="text-sm font-semibold">{t("settings.googleCalendar")}</h2>

        {!googleReady && (
          <p className="mt-3 text-sm text-muted">{t("settings.missingEnv")}</p>
        )}

        {googleReady && !connected && (
          <div className="mt-3">
            <p className="text-sm text-muted">{t("settings.reconnectHint")}</p>
            <Link
              href="/api/auth/google/login?next=/legacy/settings"
              className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              {t("common.signInGoogle")}
            </Link>
          </div>
        )}

        {googleReady && connected && (
          <GoogleCalendarSyncPanel
            lastSyncAt={token?.last_sync_at ?? null}
            calendarEventCount={calendarEventCount}
            initialSyncStatus={token?.sync_status ?? "idle"}
            disconnectAction={disconnectGoogle}
          />
        )}
      </section>
    </>
  );
}
