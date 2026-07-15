import { useMemo } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { useI18n } from "./i18n";

export function textAlignStart(rtl: boolean): TextStyle["textAlign"] {
  return rtl ? "right" : "left";
}

export function textAlignEnd(rtl: boolean): TextStyle["textAlign"] {
  return rtl ? "left" : "right";
}

/** Locale-aware layout helpers for React Native (direction + text alignment). */
export function useLayoutDir() {
  const { rtl } = useI18n();

  return useMemo(
    () => ({
      rtl,
      direction: (rtl ? "rtl" : "ltr") as NonNullable<ViewStyle["direction"]>,
      textStart: textAlignStart(rtl),
      textEnd: textAlignEnd(rtl),
      /** Dates, codes, and phone numbers stay LTR even in Hebrew UI. */
      textLtr: "left" as const,
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
      },
      /** Dropdown menus anchored to the menu button side. */
      menuAnchor: {
        alignItems: (rtl ? "flex-start" : "flex-end") as ViewStyle["alignItems"],
      },
    }),
    [rtl]
  );
}
