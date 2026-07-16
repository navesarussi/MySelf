import React, { useState } from "react";
import { Platform, Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api } from "../src/api/resources";
import { useApi, useMutate } from "../src/hooks";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { useSession, API_URL } from "../src/session";
import { Btn, Card, Chip, Row, Screen, SectionTitle, confirmDelete } from "../src/components/ui";
import { getAppVersion } from "../src/version";
import {
  ALL_BOTTOM_TAB_IDS,
  TAB_LABEL_KEY,
  useNavPrefs,
} from "../src/nav-prefs";

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
  const c = useColors();
  const { t, locale, setLocale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const version = getAppVersion();
  const { signOut } = useSession();
  const { run, busy } = useMutate();
  const { bottomTabs, toggleBottomTab } = useNavPrefs();
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
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textSm,
            textAlign: textStart, writingDirection,
            marginBottom: 8,
          }}
        >
          {t("language.hint")}
        </Text>
        <Row>
          <Chip label={t("language.he")} active={locale === "he"} onPress={() => setLocale("he")} />
          <Chip label={t("language.en")} active={locale === "en"} onPress={() => setLocale("en")} />
        </Row>
      </Card>

      <SectionTitle>{t("settings.bottomTabs")}</SectionTitle>
      <Card>
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textSm,
            textAlign: textStart, writingDirection,
            marginBottom: 8,
          }}
        >
          {t("settings.bottomTabsHint")}
        </Text>
        <Row wrap>
          {ALL_BOTTOM_TAB_IDS.map((id) => (
            <Chip
              key={id}
              label={t(TAB_LABEL_KEY[id])}
              active={bottomTabs.includes(id)}
              onPress={() => toggleBottomTab(id)}
            />
          ))}
        </Row>
        {bottomTabs.length <= 1 ? (
          <Text
            style={{
              color: c.muted,
              fontSize: tokens.textXs,
              textAlign: textStart, writingDirection,
              marginTop: 8,
            }}
          >
            {t("settings.bottomTabsMin")}
          </Text>
        ) : null}
      </Card>

      <SectionTitle>{t("settings.appVersion")}</SectionTitle>
      <Card>
        <Text
          style={{
            color: c.ink,
            fontSize: tokens.text,
            fontWeight: "600",
            textAlign: textStart, writingDirection,
          }}
        >
          {t("settings.versionValue", { version })}
        </Text>
      </Card>

      <SectionTitle>{t("settings.googleCalendar")}</SectionTitle>
      <Card>
        {syncQ.data?.connected ? (
          <>
            <Text style={{ color: c.good, textAlign: textStart, writingDirection }}>
              ✓ {t("settings.connected")} · {syncQ.data.eventCount ?? 0} {t("settings.importedEvents")}
            </Text>
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textXs,
                textAlign: textStart, writingDirection,
                marginTop: 4,
              }}
            >
              {t("settings.lastSync")}:{" "}
              {syncQ.data.lastSyncAt
                ? new Date(syncQ.data.lastSyncAt).toLocaleString(locale === "he" ? "he-IL" : "en-US")
                : t("common.notSyncedYet")}
            </Text>
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textXs,
                textAlign: textStart, writingDirection,
                marginTop: 2,
              }}
            >
              {t("settings.autoSync")}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("common.syncNow")} onPress={runSync} disabled={busy} />
            </Row>
          </>
        ) : (
          <>
            <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>
              {t("settings.reconnectHint")}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("common.signInGoogle")} onPress={connectGoogle} />
            </Row>
          </>
        )}
        {syncMessage ? (
          <Text
            style={{
              color: c.accent,
              fontSize: tokens.textXs,
              textAlign: textStart, writingDirection,
              marginTop: 8,
            }}
          >
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
