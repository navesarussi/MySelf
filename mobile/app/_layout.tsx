import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/session";
import { I18nProvider, useI18n } from "../src/i18n";
import { ThemeProvider, useColors } from "../src/theme";

function AppStack() {
  const c = useColors();
  const { t, rtl } = useI18n();

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.dir = rtl ? "rtl" : "ltr";
      document.documentElement.lang = rtl ? "he" : "en";
    }
  }, [rtl]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.ink,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="timeline" options={{ title: t("nav.timeline") }} />
        <Stack.Screen name="goals" options={{ title: t("nav.goals") }} />
        <Stack.Screen name="library" options={{ title: t("nav.library") }} />
        <Stack.Screen name="settings" options={{ title: t("nav.settings") }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <SessionProvider>
          <AppStack />
        </SessionProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
