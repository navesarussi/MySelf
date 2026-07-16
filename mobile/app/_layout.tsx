import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as ScreenOrientation from "expo-screen-orientation";
import { useFonts } from "expo-font";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider } from "../src/session";
import { I18nProvider, useI18n } from "../src/i18n";
import { NavPrefsProvider } from "../src/nav-prefs";
import { ThemeProvider, useColors } from "../src/theme";
import { ToastProvider } from "../src/toast";
import { ErrorBoundary } from "../src/components/error-boundary";

SplashScreen.preventAutoHideAsync();

function AppStack() {
  const c = useColors();
  const { t } = useI18n();

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
        <Stack.Screen name="timeline-full" options={{ headerShown: false, animation: "fade" }} />
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

  // App is portrait everywhere; only the full-screen timeline unlocks landscape.
  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
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
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
