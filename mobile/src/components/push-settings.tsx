import React, { useCallback, useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { api } from "../api/resources";
import { useSession } from "../session";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Btn, Card, Chip, Row, SectionTitle } from "./ui";
import { registerPushToken } from "../push/register";

type Prefs = {
  enabled: boolean;
  agent: boolean;
  relationships: boolean;
  habits: boolean;
  tasks: boolean;
  timeline: boolean;
};

const TYPE_KEYS: (keyof Omit<Prefs, "enabled">)[] = [
  "agent",
  "relationships",
  "habits",
  "tasks",
  "timeline",
];

function toPrefs(p: Prefs): Prefs {
  return {
    enabled: p.enabled,
    agent: p.agent,
    relationships: p.relationships,
    habits: p.habits,
    tasks: p.tasks,
    timeline: p.timeline,
  };
}

export function PushSettingsSection() {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const { token, serverUrl } = useSession();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const muted = { color: c.muted, textAlign: textStart, writingDirection } as const;

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setPrefs(toPrefs(await api.pushPreferences({ token, serverUrl })));
    } catch {
      setMessage(t("settings.pushLoadFailed"));
    }
  }, [token, serverUrl, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(partial: Partial<Prefs>) {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      setPrefs(toPrefs(await api.patchPushPreferences({ token, serverUrl }, partial)));
    } catch {
      setMessage(t("settings.pushSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function enableAndRegister() {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const pushToken = await registerPushToken({ token, serverUrl });
      if (!pushToken) {
        setMessage(t("settings.pushPermissionDenied"));
        return;
      }
      await patch({ enabled: true });
    } catch {
      setMessage(t("settings.pushSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      await registerPushToken({ token, serverUrl });
      const res = await api.pushTest({ token, serverUrl });
      setMessage(
        res.ok && res.sent
          ? t("settings.pushTestSent")
          : t("settings.pushTestFailed", { reason: res.reason ?? "none" })
      );
    } catch {
      setMessage(t("settings.pushTestFailed", { reason: "error" }));
    } finally {
      setBusy(false);
    }
  }

  if (Platform.OS === "web") {
    return (
      <>
        <SectionTitle>{t("settings.pushTitle")}</SectionTitle>
        <Card>
          <Text style={muted}>{t("settings.pushWebHint")}</Text>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionTitle>{t("settings.pushTitle")}</SectionTitle>
      <Card>
        <Text style={{ ...muted, fontSize: tokens.textSm, marginBottom: 10 }}>
          {t("settings.pushHint")}
        </Text>
        <Row wrap>
          <Chip
            label={t("settings.pushEnabled")}
            active={!!prefs?.enabled}
            onPress={() =>
              prefs?.enabled ? void patch({ enabled: false }) : void enableAndRegister()
            }
          />
        </Row>
        {prefs?.enabled ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ ...muted, fontSize: tokens.textXs, marginBottom: 8 }}>
              {t("settings.pushTypes")}
            </Text>
            <Row wrap>
              {TYPE_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={t(`settings.pushType_${key}`)}
                  active={prefs[key]}
                  onPress={() => void patch({ [key]: !prefs[key] })}
                />
              ))}
            </Row>
          </View>
        ) : null}
        <Row style={{ marginTop: 12 }} wrap>
          <Btn small label={t("settings.pushTest")} onPress={() => void sendTest()} disabled={busy} />
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
