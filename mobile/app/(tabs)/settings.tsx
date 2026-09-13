import React, { useCallback, useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import { Redirect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import { useSession, API_URL } from "../../src/session";
import { Btn, Card, Chip, Row, Screen, SectionTitle, confirmDelete } from "../../src/components/ui";
import { getAppVersion } from "../../src/version";
import {
  ALL_BOTTOM_TAB_IDS,
  TAB_LABEL_KEY,
  useNavPrefs,
} from "../../src/nav-prefs";
import { MondaySettingsSection } from "../../src/components/monday-settings";
import { GithubSettingsSection } from "../../src/components/github-settings";
import { PushSettingsSection } from "../../src/components/push-settings";
import { FinanceSourcesSettingsSection } from "../../src/components/finance/finance-sources-settings";
import { useSyncProgress } from "../../src/components/use-sync-progress";
import { unregisterPushToken } from "../../src/push/register";
import {
  useApiQuery,
  useApiMutation,
  queryKeys,
  queryClient,
  pollUntilSyncDone,
  syncGoogleTasksWithPoll,
} from "../../src/query";

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
  const c = useColors();
  const { t, locale, setLocale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const version = getAppVersion();
  const { ready, signOut, token, serverUrl } = useSession();
  const { run, busy } = useApiMutation();
  const { bottomTabs, toggleBottomTab } = useNavPrefs();
  const syncQ = useApiQuery(queryKeys.syncStatus, api.syncStatus);
  const googleTasksQ = useApiQuery(queryKeys.googleTasksStatus, api.googleTasksStatus);
  const gmailQ = useApiQuery(queryKeys.gmailStatus, api.gmailStatus);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tasksSyncMessage, setTasksSyncMessage] = useState<string | null>(null);
  const tasksSyncProgress = useSyncProgress();
  const tasksSyncLabel =
    tasksSyncProgress.progress ? tasksSyncProgress.text : tasksSyncMessage;
  const [availableLists, setAvailableLists] = useState<{ id: string; title: string }[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  const savedListIds = googleTasksQ.data?.selected_list_ids ?? [];
  const listsDirty =
    [...selectedListIds].sort().join(",") !== [...savedListIds].sort().join(",");

  async function logout() {
    if (token && serverUrl) {
      try {
        await unregisterPushToken({ token, serverUrl });
      } catch {
        /* best-effort */
      }
    }
    await signOut();
    router.replace("/login");
  }

  if (ready && !token) return <Redirect href="/login" />;

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

  async function connectGoogleUnified() {
    const appRedirect =
      Platform.OS === "web"
        ? `${window.location.origin}/settings`
        : ExpoLinking.createURL("/settings");
    const connectUrl = `${API_URL}/api/auth/google/login?next=${encodeURIComponent("/settings")}&app_redirect=${encodeURIComponent(appRedirect)}`;
    if (Platform.OS === "web") {
      window.location.href = connectUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(connectUrl, appRedirect);
    if (result.type !== "cancel") {
      refreshAll();
    }
  }

  const connectGoogle = connectGoogleUnified;

  async function runSync() {
    setSyncMessage(t("settings.syncing"));
    try {
      const result = await run((config) => api.runSync(config));
      if (!result?.ok) {
        setSyncMessage(t("settings.syncFailed"));
        return;
      }
      if (result.started || result.alreadyRunning) {
        const status = await run((config) => pollUntilSyncDone(config, api.syncStatus));
        if (status?.syncStatus === "completed") {
          setSyncMessage(t("flash.calendarSynced", { count: status.eventCount ?? 0 }));
        } else {
          setSyncMessage(t("settings.syncFailed"));
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.timelineEvents });
      } else if (result.imported != null) {
        setSyncMessage(t("flash.calendarSynced", { count: result.imported }));
      }
    } catch {
      setSyncMessage(t("settings.syncFailed"));
    }
    syncQ.refresh();
  }

  const connectGoogleTasks = connectGoogleUnified;

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
    tasksSyncProgress.reset();
    setTasksSyncMessage(t("settings.syncing"));
    try {
      const result = await run((config) =>
        syncGoogleTasksWithPoll(config, tasksSyncProgress.onProgress)
      );
      if (result?.ok) {
        const refreshed = await googleTasksQ.refresh();
        setTasksSyncMessage(
          t("flash.tasksSynced", { count: refreshed?.taskCount ?? result.imported ?? 0 })
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
      } else {
        setTasksSyncMessage(t("settings.syncFailed"));
      }
    } catch {
      setTasksSyncMessage(t("settings.syncFailed"));
    } finally {
      tasksSyncProgress.reset();
    }
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

  const connectGmail = connectGoogleUnified;

  function disconnectGmail() {
    confirmDelete(
      t("settings.gmailDisconnectConfirm"),
      async () => {
        await run((config) => api.disconnectGmail(config), {
          success: "flash.gmailDisconnected",
        });
        gmailQ.refresh();
      },
      t("settings.gmailDisconnect"),
      t("common.cancel")
    );
  }

  function refreshAll() {
    syncQ.refresh();
    googleTasksQ.refresh();
    gmailQ.refresh();
  }

  return (
    <Screen
      title={t("settings.title")}
      subtitle={t("settings.subtitle")}
      refreshing={syncQ.loading || googleTasksQ.loading || gmailQ.loading}
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

      <SectionTitle
        onAdd={connectGoogle}
        addLabel={t("common.signInGoogle")}
      >
        {t("settings.googleCalendar")}
      </SectionTitle>
      <Card>
        {syncQ.data?.connected ? (
          <>
            <Text style={{ color: c.good, textAlign: textStart, writingDirection }}>
              ✓ {t("settings.connected")}
            </Text>
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textSm,
                marginTop: 4,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t("settings.importedEventsCount", { count: syncQ.data.eventCount ?? 0 })}
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

      <SectionTitle
        onAdd={connectGoogleTasks}
        addLabel={t("settings.connectGoogleTasks")}
      >
        {t("settings.googleTasks")}
      </SectionTitle>
      <Card>
        {googleTasksQ.data?.connected ? (
          <>
            <Text style={{ color: c.good, textAlign: textStart, writingDirection }}>
              ✓ {t("settings.connected")}
            </Text>
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textSm,
                marginTop: 4,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t("settings.importedTasksCount", {
                count: googleTasksQ.data.taskCount ?? 0,
              })}
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
        {tasksSyncLabel ? (
          <Text
            style={{
              color: c.accent,
              fontSize: tokens.textXs,
              textAlign: textStart, writingDirection,
              marginTop: 8,
            }}
          >
            {tasksSyncLabel}
          </Text>
        ) : null}
      </Card>

      <SectionTitle onAdd={connectGmail} addLabel={t("settings.connectGmail")}>
        {t("settings.gmail")}
      </SectionTitle>
      <Card>
        {gmailQ.data?.working ? (
          <>
            <Text style={{ color: c.good, textAlign: textStart, writingDirection }}>
              ✓ {t("settings.connected")}
            </Text>
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textXs,
                textAlign: textStart,
                writingDirection,
                marginTop: 4,
              }}
            >
              {t("settings.gmailWorkingHint")}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Btn
                small
                variant="ghost"
                label={t("settings.gmailDisconnect")}
                onPress={disconnectGmail}
                disabled={busy}
              />
            </Row>
          </>
        ) : gmailQ.data?.connected ? (
          <>
            <Text style={{ color: c.warn, textAlign: textStart, writingDirection }}>
              ⚠{" "}
              {gmailQ.data.error === "gmail_api_disabled"
                ? t("settings.gmailApiDisabled")
                : t("settings.gmailNeedsReconnect")}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("settings.connectGmail")} onPress={connectGmail} disabled={busy} />
              <Btn
                small
                variant="ghost"
                label={t("settings.gmailDisconnect")}
                onPress={disconnectGmail}
                disabled={busy}
              />
            </Row>
          </>
        ) : (
          <>
            <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>
              {t("settings.gmailReconnectHint")}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("settings.connectGmail")} onPress={connectGmail} />
            </Row>
          </>
        )}
      </Card>

      <PushSettingsSection />

      <FinanceSourcesSettingsSection />

      <MondaySettingsSection />

      <GithubSettingsSection />

      <SectionTitle>{t("nav.logout")}</SectionTitle>
      <Card style={{ borderColor: c.warn }}>
        <Btn
          variant="warn"
          label={t("nav.logout")}
          onPress={() =>
            confirmDelete(t("mobile.logoutConfirm"), () => void logout(), t("nav.logout"), t("common.cancel"))
          }
        />
      </Card>

      <Text
        style={{
          color: c.muted,
          fontSize: 11,
          textAlign: "center",
          marginTop: 24,
          marginBottom: 8,
        }}
      >
        {t("settings.versionValue", { version })}
      </Text>
    </Screen>
  );
}
