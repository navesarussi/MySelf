import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform, useColorScheme, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette } from "@/components/ui/colors";
import {
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  resolveAppearance,
  type AppearancePreference,
  type ColorScheme,
} from "@/lib/appearance";

export type ThemeColors = { [K in keyof (typeof palette)["dark"]]: string };

const STORAGE_KEY = "myself.appearance";

type ThemeValue = {
  colors: ThemeColors;
  preference: AppearancePreference;
  setPreference: (next: AppearancePreference) => void;
  resolved: ColorScheme;
};

const ThemeContext = createContext<ThemeValue>({
  colors: palette.dark,
  preference: DEFAULT_APPEARANCE,
  setPreference: () => {},
  resolved: "dark",
});

function applyWebColorScheme(scheme: ColorScheme, bg: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.colorScheme = scheme;
  root.style.backgroundColor = bg;
  root.dataset.theme = scheme;
  if (document.body) document.body.style.backgroundColor = bg;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>(DEFAULT_APPEARANCE);
  const resolved = resolveAppearance(preference, system === "light" ? "light" : system === "dark" ? "dark" : null);
  const colors = resolved === "light" ? palette.light : palette.dark;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (isAppearancePreference(raw)) setPreferenceState(raw);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    applyWebColorScheme(resolved, colors.bg);
  }, [resolved, colors.bg]);

  const value = useMemo<ThemeValue>(
    () => ({
      colors,
      preference,
      resolved,
      setPreference: (next) => {
        setPreferenceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    }),
    [colors, preference, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeCanvas({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

/** Shared numeric tokens (spacing/typography) matching the web's look. */
export const tokens = {
  radius: 12,
  radiusSm: 8,
  pad: 12,
  padLg: 16,
  text: 14,
  textSm: 12,
  textXs: 11,
  title: 22,
  subtitle: 13,
  press: 0.85,
} as const;
