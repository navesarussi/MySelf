import React, { useState } from "react";
import { Text } from "react-native";
import { api } from "../src/api/resources";
import { useApi, useMutate } from "../src/hooks";
import { useI18n } from "../src/i18n";
import { useColors, tokens } from "../src/theme";
import { useSession } from "../src/session";
import { Btn, Card, Chip, Input, Label, Row, Screen, SectionTitle, confirmDelete } from "../src/components/ui";

export default function SettingsScreen() {
  const c = useColors();
  const { t, locale, setLocale } = useI18n();
  const { serverUrl, setServerUrl, signOut } = useSession();
  const { run, busy } = useMutate();
  const syncQ = useApi(api.syncStatus);
  const [serverDraft, setServerDraft] = useState(serverUrl);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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
          <Text style={{ color: c.muted, textAlign: "right" }}>{t("settings.reconnectHint")}</Text>
        )}
        {syncMessage ? (
          <Text style={{ color: c.accent, fontSize: tokens.textXs, textAlign: "right", marginTop: 8 }}>
            {syncMessage}
          </Text>
        ) : null}
      </Card>

      <SectionTitle>{t("mobile.serverUrl")}</SectionTitle>
      <Card>
        <Label>{t("mobile.serverUrl")}</Label>
        <Input
          value={serverDraft}
          onChangeText={setServerDraft}
          autoCapitalize="none"
          keyboardType="url"
          style={{ textAlign: "left" }}
        />
        <Btn small label={t("common.save")} onPress={() => setServerUrl(serverDraft)} />
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
