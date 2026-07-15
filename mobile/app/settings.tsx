import React, { useState } from "react";
import { Platform, Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api } from "../src/api/resources";
import { useApi, useMutate } from "../src/hooks";
import { useI18n } from "../src/i18n";
import { useColors, tokens } from "../src/theme";
import { useSession, API_URL } from "../src/session";
import { Btn, Card, Chip, Row, Screen, SectionTitle, confirmDelete } from "../src/components/ui";

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
  const c = useColors();
  const { t, locale, setLocale } = useI18n();
  const { signOut } = useSession();
  const { run, busy } = useMutate();
  const syncQ = useApi(api.syncStatus);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function connectGoogle() {
    const loginUrl = `${API_URL}/api/auth/google/login?next=${encodeURIComponent("/settings")}`;
    if (Platform.OS === "web") {
      window.open(loginUrl, "_blank");
      return;
    }
    await WebBrowser.openBrowserAsync(loginUrl);
    syncQ.refresh();
  }

  async function runSync() {
    setSyncMessage(t("settings.syncing"));
    try {
      const result = await run((config) => api.runSync(config));
      setSyncMessage(
        result?.ok
          ? t("flash.calendarSynced", { count: result.imported ?? 0 })
          : t("settings.syncFailed")
      );
    } catch {
      setSyncMessage(t("settings.syncFailed"));
    }
    syncQ.refresh();
  }

  return (
    <Screen title={t("settings.title")} subtitle={t("settings.subtitle")} refreshing={syncQ.loading} onRefresh={syncQ.refresh}>
      <SectionTitle>{t("language.label")}</SectionTitle>
      <Card>
        <Text style={{ color: c.muted, fontSize: tokens.textSm, textAlign: "right", marginBottom: 8 }}>
          {t("language.hint")}
        </Text>
        <Row>
          <Chip label={t("language.he")} active={locale === "he"} onPress={() => setLocale("he")} />
          <Chip label={t("language.en")} active={locale === "en"} onPress={() => setLocale("en")} />
        </Row>
      </Card>

      <SectionTitle>{t("settings.googleCalendar")}</SectionTitle>
      <Card>
        {syncQ.data?.connected ? (
          <>
            <Text style={{ color: c.good, textAlign: "right" }}>
              ✓ {t("settings.connected")} · {syncQ.data.eventCount ?? 0} {t("settings.importedEvents")}
            </Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 4 }}>
              {t("settings.lastSync")}:{" "}
              {syncQ.data.lastSyncAt
                ? new Date(syncQ.data.lastSyncAt).toLocaleString(locale === "he" ? "he-IL" : "en-US")
                : t("common.notSyncedYet")}
            </Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "right", marginTop: 2 }}>
              {t("settings.autoSync")}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("common.syncNow")} onPress={runSync} disabled={busy} />
            </Row>
          </>
        ) : (
          <>
            <Text style={{ color: c.muted, textAlign: "right" }}>{t("settings.reconnectHint")}</Text>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("common.signInGoogle")} onPress={connectGoogle} />
            </Row>
          </>
        )}
        {syncMessage ? (
          <Text style={{ color: c.accent, fontSize: tokens.textXs, textAlign: "right", marginTop: 8 }}>
            {syncMessage}
          </Text>
        ) : null}
      </Card>

      <SectionTitle>{t("nav.logout")}</SectionTitle>
      <Card style={{ borderColor: c.warn }}>
        <Btn
          variant="warn"
          label={t("nav.logout")}
          onPress={() =>
            confirmDelete(t("mobile.logoutConfirm"), () => signOut(), t("nav.logout"), t("common.cancel"))
          }
        />
      </Card>
    </Screen>
  );
}
