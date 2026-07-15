import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { AntDesign } from "@expo/vector-icons";
import { useSession, API_URL } from "../src/session";
import { useI18n } from "../src/i18n";
import { useColors, tokens } from "../src/theme";
import { Loading } from "../src/components/ui";

WebBrowser.maybeCompleteAuthSession();

function GoogleSignInButton({ onPress, busy, label }: { onPress: () => void; busy: boolean; label: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        flexDirection: "row-reverse",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: tokens.radius,
        paddingVertical: 14,
        paddingHorizontal: 20,
        opacity: pressed || busy ? 0.85 : 1,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      })}
    >
      {busy ? (
        <ActivityIndicator color={c.accent} />
      ) : (
        <AntDesign name="google" size={20} color="#4285F4" />
      )}
      <Text style={{ color: c.ink, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function DecoBlob({ color, size, top, right, opacity }: { color: string; size: number; top: number; right: number; opacity: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top,
        right,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

export default function LoginScreen() {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const { ready, token, signIn } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (token) return <Redirect href="/" />;

  async function googleSignIn() {
    setError(null);
    setBusy(true);
    try {
      const appRedirect = Linking.createURL("auth");
      const nextPath = `/api/v1/auth/mobile-redirect?app_redirect=${encodeURIComponent(appRedirect)}`;
      const loginUrl = `${API_URL}/api/auth/google/login?next=${encodeURIComponent(nextPath)}`;

      if (Platform.OS === "web") {
        window.location.href = loginUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(loginUrl, appRedirect);
      if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        const authToken = typeof parsed.queryParams?.token === "string" ? parsed.queryParams.token : "";
        if (authToken) {
          await signIn(authToken);
          router.replace("/");
          return;
        }
      }
      if (result.type !== "cancel") {
        setError(t("login.error"));
      }
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  async function openPrivacy() {
    const url = `${API_URL}/privacy`;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      await WebBrowser.openBrowserAsync(url);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <DecoBlob color={c.accent} size={220} top={-40} right={-60} opacity={0.12} />
      <DecoBlob color={c.accent2} size={160} top={120} right={-30} opacity={0.1} />
      <DecoBlob color={c.good} size={100} top={-20} right={120} opacity={0.08} />

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 28,
          paddingVertical: 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 36 }}>
          <View
            style={{
              padding: 4,
              borderRadius: 28,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.border,
              marginBottom: 20,
              shadowColor: c.accent,
              shadowOpacity: 0.15,
              shadowRadius: 24,
              elevation: 4,
            }}
          >
            <Image
              source={require("../assets/icon.png")}
              style={{ width: 88, height: 88, borderRadius: 22 }}
              accessibilityLabel={t("nav.brand")}
            />
          </View>

          <Text style={{ color: c.ink, fontSize: 28, fontWeight: "800", textAlign: "center" }}>
            {t("nav.brand")}
          </Text>
          <Text
            style={{
              color: c.accent,
              fontSize: tokens.subtitle,
              fontWeight: "600",
              textAlign: "center",
              marginTop: 8,
            }}
          >
            {t("login.welcome")}
          </Text>
          <Text
            style={{
              color: c.muted,
              fontSize: 15,
              lineHeight: 24,
              textAlign: "center",
              marginTop: 10,
              maxWidth: 300,
            }}
          >
            {t("login.tagline")}
          </Text>
        </View>

        <GoogleSignInButton
          onPress={googleSignIn}
          busy={busy}
          label={busy ? t("login.signingIn") : t("common.signInGoogle")}
        />

        {error ? (
          <Text style={{ color: c.warn, fontSize: tokens.textSm, textAlign: "center", marginTop: 14 }}>
            {error}
          </Text>
        ) : null}

        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textXs,
            lineHeight: 18,
            textAlign: "center",
            marginTop: 28,
            paddingHorizontal: 8,
          }}
        >
          {t("login.calendarNote")}{" "}
          <Text onPress={openPrivacy} style={{ color: c.accent, textDecorationLine: "underline" }}>
            {t("common.privacyPolicy")}
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
