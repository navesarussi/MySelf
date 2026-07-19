import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { api } from "../api/resources";
import { useApi, useMutate } from "../hooks";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { useSession, API_URL } from "../session";
import { Btn, Card, Chip, Row, SectionTitle, confirmDelete } from "./ui";
import { groupGithubReposByOwner } from "@/lib/integrations/task-sources/github/repos";

type RepoItem = { id: string; title: string; owner: string; name: string };

export function GithubSettingsSection() {
  const c = useColors();
  const { t, locale } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const { token, serverUrl } = useSession();
  const { run, busy } = useMutate();
  const statusQ = useApi(api.githubStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [syncingRepo, setSyncingRepo] = useState<string | null>(null);
  const [reposOpen, setReposOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState<Record<string, boolean>>({});

  const saved = statusQ.data?.selected_list_ids ?? [];
  const counts = statusQ.data?.task_count_by_repo ?? {};
  const dirty = [...selected].sort().join(",") !== [...saved].sort().join(",");
  const groups = useMemo(() => groupGithubReposByOwner(repos), [repos]);

  useEffect(() => {
    setSelected(saved);
  }, [saved.join(",")]);

  const loadRepos = useCallback(async () => {
    if (!token || !serverUrl || !statusQ.data?.connected) return;
    setLoadingRepos(true);
    try {
      setRepos(await api.githubRepos({ token, serverUrl }));
    } catch {
      setRepos([]);
      setMessage(t("settings.githubReposFailed"));
    } finally {
      setLoadingRepos(false);
    }
  }, [token, serverUrl, statusQ.data?.connected, t]);

  useEffect(() => {
    if (statusQ.data?.connected) loadRepos();
    else {
      setRepos([]);
      setSelected([]);
      setReposOpen(false);
      setOwnerOpen({});
    }
  }, [statusQ.data?.connected, loadRepos]);

  async function connect() {
    const redirect =
      Platform.OS === "web"
        ? `${window.location.origin}/settings`
        : ExpoLinking.createURL("/settings");
    const url = `${API_URL}/api/integrations/github/connect?next=${encodeURIComponent("/settings")}&app_redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") {
      window.location.href = url;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(url, redirect);
    if (result.type !== "cancel") statusQ.refresh();
  }

  async function saveRepos() {
    setMessage(null);
    await run((config) => api.patchGithubSettings(config, { selected_list_ids: selected }), {
      success: "flash.githubReposSaved",
    });
    statusQ.refresh();
  }

  async function syncRepo(repoId: string) {
    setSyncingRepo(repoId);
    setMessage(t("settings.syncing"));
    try {
      const result = await run((config) =>
        api.syncTaskSources(config, "github", { list_ids: [repoId] })
      );
      setMessage(
        result?.ok
          ? t("flash.tasksSynced", { count: result.imported ?? 0 })
          : t("settings.syncFailed")
      );
      statusQ.refresh();
    } catch {
      setMessage(t("settings.syncFailed"));
    } finally {
      setSyncingRepo(null);
    }
  }

  async function syncNow() {
    setMessage(t("settings.syncing"));
    try {
      const result = await run((config) => api.syncTaskSources(config, "github"));
      setMessage(
        result?.ok
          ? t("flash.tasksSynced", { count: result.imported ?? 0 })
          : t("settings.syncFailed")
      );
    } catch {
      setMessage(t("settings.syncFailed"));
    }
    statusQ.refresh();
  }

  function disconnect() {
    confirmDelete(
      t("settings.githubDisconnectConfirm"),
      async () => {
        await run((config) => api.disconnectGithub(config), {
          success: "flash.githubDisconnected",
        });
        setRepos([]);
        setSelected([]);
        setMessage(null);
        statusQ.refresh();
      },
      t("settings.githubDisconnect"),
      t("common.cancel")
    );
  }

  function toggleOwner(owner: string) {
    setOwnerOpen((prev) => ({ ...prev, [owner]: !prev[owner] }));
  }

  return (
    <View>
      <SectionTitle
        onAdd={connect}
        addLabel={
          statusQ.data?.connected ? t("settings.githubReconnect") : t("settings.connectGithub")
        }
      >
        {t("settings.github")}
      </SectionTitle>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          marginBottom: 8,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {t("settings.githubAutoSync")}
      </Text>

      {statusQ.data?.connected ? (
        <Card style={{ marginBottom: 10 }}>
          <Text
            style={{
              color: c.good,
              fontWeight: "600",
              textAlign: textStart,
              writingDirection: "ltr",
            }}
          >
            ✓ {statusQ.data.account_name ?? t("settings.connected")}
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
            {t("settings.importedTasksCount", { count: statusQ.data.taskCount ?? 0 })}
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
            {statusQ.data.lastSyncAt
              ? new Date(statusQ.data.lastSyncAt).toLocaleString(
                  locale === "he" ? "he-IL" : "en-US"
                )
              : t("common.notSyncedYet")}
          </Text>

          {loadingRepos ? (
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
          ) : groups.length ? (
            <>
              <Pressable
                onPress={() => setReposOpen((v) => !v)}
                style={{ marginTop: 10, marginBottom: reposOpen ? 8 : 0 }}
              >
                <Text
                  style={{
                    color: c.accent,
                    fontSize: tokens.textSm,
                    textAlign: textStart,
                    writingDirection,
                  }}
                >
                  {reposOpen ? "▾ " : "▸ "}
                  {t("settings.githubReposToggle", {
                    selected: selected.length,
                    total: repos.length,
                  })}
                </Text>
              </Pressable>

              {reposOpen ? (
                <>
                  <Text
                    style={{
                      color: c.muted,
                      fontSize: tokens.textXs,
                      textAlign: textStart,
                      writingDirection,
                      marginBottom: 10,
                    }}
                  >
                    {t("settings.githubReposHint")}
                  </Text>
                  {groups.map((group) => {
                    const selectedInGroup = group.repos.filter((r) =>
                      selected.includes(r.id)
                    ).length;
                    const open = ownerOpen[group.owner] === true;
                    return (
                      <View key={group.owner} style={{ marginBottom: 8 }}>
                        <Pressable onPress={() => toggleOwner(group.owner)}>
                          <Text
                            style={{
                              color: c.ink,
                              fontWeight: "700",
                              fontSize: tokens.textSm,
                              textAlign: textStart,
                              writingDirection: "ltr",
                              marginBottom: open ? 6 : 0,
                            }}
                          >
                            {open ? "▾ " : "▸ "}
                            {group.owner}{" "}
                            <Text style={{ color: c.muted, fontWeight: "400" }}>
                              ({selectedInGroup}/{group.repos.length})
                            </Text>
                          </Text>
                        </Pressable>
                        {open
                          ? group.repos.map((repo) => {
                              const active = selected.includes(repo.id);
                              const count = counts[repo.id] ?? 0;
                              return (
                                <Row key={repo.id} style={{ marginBottom: 6 }} wrap>
                                  <Chip
                                    label={`${repo.name}${count ? ` · ${count}` : ""}`}
                                    active={active}
                                    onPress={() =>
                                      setSelected((prev) =>
                                        prev.includes(repo.id)
                                          ? prev.filter((id) => id !== repo.id)
                                          : [...prev, repo.id]
                                      )
                                    }
                                  />
                                  {active ? (
                                    <Btn
                                      small
                                      label={
                                        syncingRepo === repo.id
                                          ? t("settings.syncing")
                                          : t("common.syncNow")
                                      }
                                      onPress={() => syncRepo(repo.id)}
                                      disabled={busy || syncingRepo === repo.id}
                                    />
                                  ) : null}
                                </Row>
                              );
                            })
                          : null}
                      </View>
                    );
                  })}
                  <Text
                    style={{
                      color: c.muted,
                      fontSize: tokens.textXs,
                      textAlign: textStart,
                      writingDirection,
                      marginTop: 4,
                    }}
                  >
                    {t("settings.githubOrgAccessHint")}
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textSm,
                marginTop: 8,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t("settings.githubSelectRepos")}
            </Text>
          )}

          <Row style={{ marginTop: 10 }} wrap>
            {dirty ? (
              <Btn
                small
                label={t("common.save")}
                onPress={saveRepos}
                disabled={busy || selected.length === 0}
              />
            ) : null}
            {saved.length > 0 ? (
              <Btn small label={t("common.syncNow")} onPress={syncNow} disabled={busy} />
            ) : null}
            <Btn
              small
              variant="ghost"
              label={t("settings.githubDisconnect")}
              onPress={disconnect}
              disabled={busy}
            />
          </Row>
        </Card>
      ) : (
        <Card>
          <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>
            {t("settings.githubConnectHint")}
          </Text>
          <Row style={{ marginTop: 10 }}>
            <Btn small label={t("settings.connectGithub")} onPress={connect} />
          </Row>
        </Card>
      )}

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
    </View>
  );
}
