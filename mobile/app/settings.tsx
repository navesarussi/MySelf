import React, { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Text } from "react-native";
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
  const { signOut, token, serverUrl } = useSession();
  const { run, busy } = useMutate();
  const { bottomTabs, toggleBottomTab } = useNavPrefs();
  const syncQ = useApi(api.syncStatus);
  const googleTasksQ = useApi(api.googleTasksStatus);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tasksSyncMessage, setTasksSyncMessage] = useState<string | null>(null);
  const [availableLists, setAvailableLists] = useState<{ id: string; title: string }[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  const savedListIds = googleTasksQ.data?.selected_list_ids ?? [];
  const listsDirty =
    [...selectedListIds].sort().join(",") !== [...savedListIds].sort().join(",");

  useEffect(() => {
    setSelectedListIds(savedListIds);
  }, [savedListIds.join(",")]);

  const loadGoogleTasksLists = useCallback(async () => {
    if (!token || !serverUrl || !googleTasksQ.data?.connected) return;
    setListsLoading(true);
    try {
      const lists = await api.googleTasksLists({ token, serverUrl });
      setAvailableLists(lists);
    } catch {
      setAvailableLists([]);
      setTasksSyncMessage(t("settings.googleTasksListsFailed"));
    } finally {
      setListsLoading(false);
    }
  }, [token, serverUrl, googleTasksQ.data?.connected, t]);

  useEffect(() => {
    if (googleTasksQ.data?.connected) {
      loadGoogleTasksLists();
    } else {
      setAvailableLists([]);
      setSelectedListIds([]);
    }
  }, [googleTasksQ.data?.connected, loadGoogleTasksLists]);

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

  async function connectGoogleTasks() {
    const appRedirect = Linking.createURL("/settings");
    const connectUrl = `${API_URL}/api/integrations/google-tasks/connect?app_redirect=${encodeURIComponent(appRedirect)}`;
    if (Platform.OS === "web") {
      window.location.href = connectUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(connectUrl, appRedirect);
    if (result.type !== "cancel") {
      await googleTasksQ.refresh();
    }
  }

  function toggleGoogleTasksList(id: string) {
    setSelectedListIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function saveGoogleTasksLists() {
    setTasksSyncMessage(t("common.saving"));
    try {
      await run(
        (config) => api.patchGoogleTasksSettings(config, { selected_list_ids: selectedListIds }),
        { success: "flash.googleTasksListsSaved" }
      );
      setTasksSyncMessage(null);
      googleTasksQ.refresh();
    } catch {
      setTasksSyncMessage(t("settings.syncFailed"));
    }
  }

  async function runTasksSync() {
    setTasksSyncMessage(t("settings.syncing"));
    try {
      const result = await run((config) => api.syncTaskSources(config, "google_tasks"));
      setTasksSyncMessage(
        result?.ok
          ? t("flash.tasksSynced", { count: result.imported ?? 0 })
          : t("settings.syncFailed")
      );
    } catch {
      setTasksSyncMessage(t("settings.syncFailed"));
    }
    googleTasksQ.refresh();
  }

  function disconnectGoogleTasks() {
    confirmDelete(
      t("settings.googleTasksDisconnectConfirm"),
      async () => {
        await run((config) => api.disconnectGoogleTasks(config), {
          success: "flash.googleTasksDisconnected",
        });
        setAvailableLists([]);
        setSelectedListIds([]);
        setTasksSyncMessage(null);
        googleTasksQ.refresh();
      },
      t("settings.googleTasksDisconnect"),
      t("common.cancel")
    );
  }

  function refreshAll() {
    syncQ.refresh();
    googleTasksQ.refresh();
  }

  return (
    <Screen
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      refreshing={syncQ.loading || googleTasksQ.loading}
      onRefresh={refreshAll}
    >
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

      <SectionTitle>{t("settings.googleTasks")}</SectionTitle>
      <Card>
        {googleTasksQ.data?.connected ? (
          <>
            <Text style={{ color: c.good, textAlign: textStart, writingDirection }}>
              ✓ {t("settings.connected")} · {googleTasksQ.data.taskCount ?? 0}{" "}
              {t("settings.importedTasks")}
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
              {googleTasksQ.data.lastSyncAt
                ? new Date(googleTasksQ.data.lastSyncAt).toLocaleString(locale === "he" ? "he-IL" : "en-US")
                : t("common.notSyncedYet")}
            </Text>
            {savedListIds.length === 0 ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.textSm,
                  textAlign: textStart, writingDirection,
                  marginTop: 8,
                }}
              >
                {t("settings.googleTasksSelectLists")}
              </Text>
            ) : null}
            {listsLoading ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.textXs,
                  textAlign: textStart, writingDirection,
                  marginTop: 8,
                }}
              >
                {t("common.loading")}…
              </Text>
            ) : availableLists.length ? (
              <>
                <Text
                  style={{
                    color: c.muted,
                    fontSize: tokens.textSm,
                    textAlign: textStart, writingDirection,
                    marginTop: 8,
                    marginBottom: 8,
                  }}
                >
                  {t("settings.googleTasksListsHint")}
                </Text>
                <Row wrap>
                  {availableLists.map((list) => (
                    <Chip
                      key={list.id}
                      label={list.title}
                      active={selectedListIds.includes(list.id)}
                      onPress={() => toggleGoogleTasksList(list.id)}
                    />
                  ))}
                </Row>
              </>
            ) : null}
            <Row style={{ marginTop: 10 }} wrap>
              {listsDirty && selectedListIds.length > 0 ? (
                <Btn
                  small
                  label={t("common.save")}
                  onPress={saveGoogleTasksLists}
                  disabled={busy}
                />
              ) : null}
              {savedListIds.length > 0 ? (
                <Btn small label={t("common.syncNow")} onPress={runTasksSync} disabled={busy} />
              ) : null}
              <Btn
                small
                variant="ghost"
                label={t("settings.googleTasksDisconnect")}
                onPress={disconnectGoogleTasks}
                disabled={busy}
              />
            </Row>
          </>
        ) : (
          <>
            <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>
              {t("settings.googleTasksReconnectHint")}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("settings.connectGoogleTasks")} onPress={connectGoogleTasks} />
            </Row>
          </>
        )}
        {tasksSyncMessage ? (
          <Text
            style={{
              color: c.accent,
              fontSize: tokens.textXs,
              textAlign: textStart, writingDirection,
              marginTop: 8,
            }}
          >
            {tasksSyncMessage}
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
