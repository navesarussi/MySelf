import React, { createContext, useContext } from "react";
import { useColorScheme } from "react-native";
import { palette } from "@/components/ui/colors";

export type ThemeColors = { [K in keyof (typeof palette)["dark"]]: string };

const ThemeContext = createContext<ThemeColors>(palette.dark);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const colors = scheme === "light" ? palette.light : palette.dark;
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}

export function useColors(): ThemeColors {
  return useContext(ThemeContext);
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
} as const;
