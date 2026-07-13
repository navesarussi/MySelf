import React, { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useSession, normalizeServerUrl } from "../src/session";
import { useI18n } from "../src/i18n";
import { useColors, tokens } from "../src/theme";
import { Btn, Card, Input, Label } from "../src/components/ui";
import { apiFetch } from "../src/api/client";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const { serverUrl, signIn } = useSession();
  const [server, setServer] = useState(serverUrl);
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finishSignIn(url: string, token: string) {
    const normalized = normalizeServerUrl(url);
    await apiFetch<{ ok: boolean }>({ serverUrl: normalized, token }, "/session");
    await signIn(normalized, token);
    router.replace("/");
  }

  async function googleSignIn() {
    setError(null);
    const normalized = normalizeServerUrl(server);
    if (!normalized) {
      setError(t("mobile.serverRequired"));
      return;
    }
    setBusy(true);
    try {
      const loginUrl = `${normalized}/api/auth/google/login?next=${encodeURIComponent(
        "/api/v1/auth/mobile-redirect"
      )}`;

      if (Platform.OS === "web") {
        // The app's web build runs on a different origin — open the site's
        // login; the user copies the token from the JSON page it lands on.
        window.open(
          `${normalized}/api/auth/google/login?next=${encodeURIComponent(
            "/api/v1/auth/mobile-redirect?format=json"
          )}`,
          "_blank"
        );
        setError(t("mobile.pasteTokenHint"));
        return;
      }

      const redirectUrl = Linking.createURL("auth");
      const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUrl);
      if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        const token = typeof parsed.queryParams?.token === "string" ? parsed.queryParams.token : "";
        if (token) {
          await finishSignIn(normalized, token);
          return;
        }
      }
      setError(t("mobile.loginFailed"));
    } catch {
      setError(t("mobile.loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function manualSignIn() {
    setError(null);
    if (!server.trim() || !manualToken.trim()) {
      setError(t("mobile.serverRequired"));
      return;
    }
    setBusy(true);
    try {
      await finishSignIn(server, manualToken.trim());
    } catch {
      setError(t("mobile.loginFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 24, justifyContent: "center", flexGrow: 1 }}
    >
      <Text style={{ color: c.ink, fontSize: 26, fontWeight: "800", textAlign: "center" }}>
        {t("nav.brand")}
      </Text>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.subtitle,
          textAlign: "center",
          marginTop: 6,
          marginBottom: 24,
        }}
      >
        {t("login.subtitle")}
      </Text>

      <Card>
        <Label>{t("mobile.serverUrl")}</Label>
        <Input
          value={server}
          onChangeText={setServer}
          placeholder="https://myself.example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textAlign="left"
          style={{ textAlign: "left" }}
        />
        <Btn label={t("common.signInGoogle")} onPress={googleSignIn} disabled={busy} />

        <View style={{ height: 16 }} />
        <Label>{t("mobile.manualToken")}</Label>
        <Input
          value={manualToken}
          onChangeText={setManualToken}
          placeholder={t("mobile.manualTokenPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          textAlign="left"
          style={{ textAlign: "left" }}
        />
        <Btn label={t("mobile.signInWithToken")} onPress={manualSignIn} variant="ghost" disabled={busy} />

        {error ? (
          <Text style={{ color: c.warn, fontSize: tokens.textSm, marginTop: 10, textAlign: "right" }}>
            {error}
          </Text>
        ) : null}
      </Card>

      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: "center", marginTop: 12 }}>
        {t("login.calendarNote")}
      </Text>
    </ScrollView>
  );
}
