/**
 * Product root (mobile). Website UI is frozen — see CLAUDE.md / mobile/SCOPE.md.
 * Do not add website-parity work from here; shared API lives under app/api + lib.
 */
import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import { useFonts } from "expo-font";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider, useSession } from "../src/session";
import type { HomePayload } from "../src/api/resources";
import { queryKeys } from "../src/query";
import { syncWidgetSnapshot, useWidgetHomeQuerySync } from "../src/widget/sync-widget-snapshot";
import { setAppVersion } from "../src/api/client";
import { getAppVersion } from "../src/version";
import { ThemeCanvas, ThemeProvider, useColors, useTheme } from "../src/theme";
import { I18nProvider, useI18n } from "../src/i18n";
import { NavPrefsProvider } from "../src/nav-prefs";
import { ToastProvider } from "../src/toast";
import { ErrorBoundary } from "../src/components/error-boundary";
import { usePushNotifications } from "../src/push/use-push";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient } from "../src/query/client";
import { persistOptions } from "../src/query/persist";

SplashScreen.preventAutoHideAsync();

// Identify this build to version-gated endpoints (see lib/api/client-version.ts).
// Set once at module load, not per-request: the version is fixed for the process.
setAppVersion(getAppVersion());

function useWidgetSnapshotLifecycle() {
  const { token } = useSession();
  const signedIn = !!token;
  useWidgetHomeQuerySync(signedIn);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && signedIn) {
        // Refresh home after widget App Intents so KPIs rewrite from the server.
        void queryClient.invalidateQueries({ queryKey: queryKeys.home });
        return;
      }
      if (state !== "background" && state !== "inactive") return;
      const home = queryClient.getQueryData<HomePayload>(queryKeys.home) ?? null;
      void syncWidgetSnapshot({ signedIn, home }).catch(() => {});
    });
    return () => sub.remove();
  }, [signedIn]);
}

function AppStack() {
  const c = useColors();
  const { resolved } = useTheme();
  const { t } = useI18n();
  usePushNotifications();
  useWidgetSnapshotLifecycle();

  return (
    <>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
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
        <Stack.Screen name="timeline-full" options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen
          name="finance-categorize"
          options={{ title: t("nav.finance"), presentation: "modal" }}
        />
        <Stack.Screen name="finance-transaction" options={{ title: t("nav.finance"), presentation: "modal" }} />
        <Stack.Screen name="finance-planning" options={{ title: t("nav.finance") }} />
        <Stack.Screen name="finance-history" options={{ title: t("nav.finance") }} />
        <Stack.Screen name="finance-wealth" options={{ title: t("nav.finance") }} />
        <Stack.Screen name="finance-import" options={{ title: t("finance.hubImport") }} />
        <Stack.Screen
          name="agent-chat"
          options={{
            title: t("agent.title"),
            presentation: "modal",
            gestureEnabled: true,
            headerBackVisible: false,
          }}
        />
        <Stack.Screen name="trading-journal" options={{ title: t("nav.trading") }} />
        <Stack.Screen name="trading-trade" options={{ title: t("nav.trading") }} />
        <Stack.Screen name="trading-analytics" options={{ title: t("nav.trading") }} />
        <Stack.Screen name="trading-backtests" options={{ title: t("nav.trading") }} />
        <Stack.Screen name="trading-chat" options={{ title: t("nav.trading") }} />
        <Stack.Screen name="trading-control" options={{ title: t("nav.trading") }} />
        <Stack.Screen name="trading-search" options={{ title: t("nav.trading") }} />
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

  // App is portrait everywhere; only the full-screen timeline unlocks landscape.
  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <ThemeProvider>
            <ThemeCanvas>
              <I18nProvider>
                <NavPrefsProvider>
                  <SessionProvider>
                    <ToastProvider>
                      <ErrorBoundary>
                        <AppStack />
                      </ErrorBoundary>
                    </ToastProvider>
                  </SessionProvider>
                </NavPrefsProvider>
              </I18nProvider>
            </ThemeCanvas>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
