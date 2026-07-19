import React, { useCallback, useEffect, useState } from "react";
import { Platform, Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { api, type MondayAccount } from "../api/resources";
import { useApi, useMutate } from "../hooks";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { useSession, API_URL } from "../session";
import { Btn, Card, Chip, Row, SectionTitle, confirmDelete } from "./ui";

export function MondaySettingsSection() {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const { token, serverUrl } = useSession();
  const { run, busy } = useMutate();
  const accountsQ = useApi(api.mondayAccounts);
  const [message, setMessage] = useState<string | null>(null);
  const [boardsByAccount, setBoardsByAccount] = useState<
    Record<string, { id: string; title: string }[]>
  >({});
  const [selectedByAccount, setSelectedByAccount] = useState<Record<string, string[]>>({});
  const [loadingBoards, setLoadingBoards] = useState<string | null>(null);

  const accounts = accountsQ.data?.accounts ?? [];

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const a of accounts) next[a.account_key] = a.selected_list_ids ?? [];
    setSelectedByAccount(next);
  }, [accounts.map((a) => `${a.account_key}:${(a.selected_list_ids ?? []).join(",")}`).join("|")]);

  const loadBoards = useCallback(
    async (accountKey: string) => {
      if (!token || !serverUrl) return;
      setLoadingBoards(accountKey);
      try {
        const boards = await api.mondayBoards({ token, serverUrl }, accountKey);
        setBoardsByAccount((prev) => ({ ...prev, [accountKey]: boards }));
      } catch {
        setMessage(t("settings.mondayBoardsFailed"));
      } finally {
        setLoadingBoards(null);
      }
    },
    [token, serverUrl, t]
  );

  useEffect(() => {
    for (const a of accounts) {
      if (!boardsByAccount[a.account_key]) loadBoards(a.account_key);
    }
  }, [accounts.length]);

  async function connectMonday() {
    const appRedirect =
      Platform.OS === "web"
        ? `${window.location.origin}/settings`
        : ExpoLinking.createURL("/settings");
    const connectUrl = `${API_URL}/api/integrations/monday/connect?app_redirect=${encodeURIComponent(appRedirect)}`;
    if (Platform.OS === "web") {
      window.location.href = connectUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(connectUrl, appRedirect);
    if (result.type !== "cancel") await accountsQ.refresh();
  }

  function toggleBoard(accountKey: string, boardId: string) {
    setSelectedByAccount((prev) => {
      const cur = prev[accountKey] ?? [];
      const next = cur.includes(boardId)
        ? cur.filter((id) => id !== boardId)
        : [...cur, boardId];
      return { ...prev, [accountKey]: next };
    });
  }

  function isDirty(account: MondayAccount) {
    const selected = selectedByAccount[account.account_key] ?? [];
    const saved = account.selected_list_ids ?? [];
    return [...selected].sort().join(",") !== [...saved].sort().join(",");
  }

  async function saveBoards(accountKey: string) {
    setMessage(t("common.saving"));
    try {
      await run(
        (config) =>
          api.patchMondaySettings(config, {
            account_key: accountKey,
            selected_list_ids: selectedByAccount[accountKey] ?? [],
          }),
        { success: "flash.mondayBoardsSaved" }
      );
      setMessage(null);
      accountsQ.refresh();
    } catch {
      setMessage(t("settings.syncFailed"));
    }
  }

  async function runMondaySync() {
    setMessage(t("settings.syncing"));
    try {
      const result = await run((config) => api.syncTaskSources(config, "monday"));
      setMessage(
        result?.ok
          ? t("flash.tasksSynced", { count: result.imported ?? 0 })
          : t("settings.syncFailed")
      );
    } catch {
      setMessage(t("settings.syncFailed"));
    }
    accountsQ.refresh();
  }

  function disconnect(account: MondayAccount) {
    confirmDelete(
      t("settings.mondayDisconnectConfirm", { name: account.account_name }),
      async () => {
        await run(
          (config) => api.disconnectMonday(config, { account_key: account.account_key }),
          { success: "flash.mondayDisconnected" }
        );
        setMessage(null);
        accountsQ.refresh();
      },
      t("settings.mondayDisconnect"),
      t("common.cancel")
    );
  }

  return (
    <>
      <SectionTitle>{t("settings.monday")}</SectionTitle>
      {accounts.map((account) => {
        const boards = boardsByAccount[account.account_key] ?? [];
        const selected = selectedByAccount[account.account_key] ?? [];
        return (
          <Card key={account.account_key} style={{ marginBottom: 10 }}>
            <Text style={{ color: c.good, textAlign: textStart, writingDirection }}>
              ✓ {account.account_name}
              {account.account_slug ? ` (${account.account_slug})` : ""}
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
              {t("settings.lastSync")}:{" "}
              {account.last_sync_at
                ? new Date(account.last_sync_at).toLocaleString(
                    locale === "he" ? "he-IL" : "en-US"
                  )
                : t("common.notSyncedYet")}
            </Text>
            {loadingBoards === account.account_key ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.textXs,
                  marginTop: 8,
                  textAlign: textStart,
                  writingDirection,
                }}
              >
                {t("common.loading")}…
              </Text>
            ) : boards.length ? (
              <>
                <Text
                  style={{
                    color: c.muted,
                    fontSize: tokens.textSm,
                    marginTop: 8,
                    marginBottom: 8,
                    textAlign: textStart,
                    writingDirection,
                  }}
                >
                  {t("settings.mondayBoardsHint")}
                </Text>
                <Row wrap>
                  {boards.map((board) => (
                    <Chip
                      key={board.id}
                      label={board.title}
                      active={selected.includes(board.id)}
                      onPress={() => toggleBoard(account.account_key, board.id)}
                    />
                  ))}
                </Row>
              </>
            ) : null}
            <Row style={{ marginTop: 10 }} wrap>
              {isDirty(account) && selected.length > 0 ? (
                <Btn
                  small
                  label={t("common.save")}
                  onPress={() => saveBoards(account.account_key)}
                  disabled={busy}
                />
              ) : null}
              {(account.selected_list_ids?.length ?? 0) > 0 ? (
                <Btn small label={t("common.syncNow")} onPress={runMondaySync} disabled={busy} />
              ) : null}
              <Btn
                small
                variant="ghost"
                label={t("settings.mondayDisconnect")}
                onPress={() => disconnect(account)}
                disabled={busy}
              />
            </Row>
          </Card>
        );
      })}
      <Card>
        <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>
          {accounts.length
            ? t("settings.mondayAddAnotherHint")
            : t("settings.mondayConnectHint")}
        </Text>
        <Row style={{ marginTop: 10 }}>
          <Btn small label={t("settings.mondayAddAccount")} onPress={connectMonday} />
        </Row>
        {message ? (
          <Text
            style={{
              color: c.accent,
              fontSize: tokens.textXs,
              textAlign: textStart,
              writingDirection,
              marginTop: 8,
            }}
          >
            {message}
          </Text>
        ) : null}
      </Card>
    </>
  );
}
