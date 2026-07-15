import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider } from "../src/session";
import { I18nProvider, useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { ThemeProvider, useColors } from "../src/theme";
import { ToastProvider } from "../src/toast";

SplashScreen.preventAutoHideAsync();

function AppStack() {
  const c = useColors();
  const { t, rtl } = useI18n();
  const { textStart, textLtr } = useLayoutDir();

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
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="timeline" options={{ title: t("nav.timeline") }} />
        <Stack.Screen name="goals" options={{ title: t("nav.goals") }} />
        <Stack.Screen name="library" options={{ title: t("nav.library") }} />
        <Stack.Screen name="settings" options={{ title: t("nav.settings") }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...AntDesign.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <SessionProvider>
            <ToastProvider>
              <AppStack />
            </ToastProvider>
          </SessionProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
