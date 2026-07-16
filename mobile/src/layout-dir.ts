import { useMemo } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { useI18n } from "./i18n";

/**
 * Locale-aware layout helpers.
 * Uses explicit row-reverse for RTL so layout flips immediately
 * without waiting for a native I18nManager restart.
 */
export function useLayoutDir() {
  const { rtl } = useI18n();

  return useMemo(() => {
    const textStart: NonNullable<TextStyle["textAlign"]> = rtl ? "right" : "left";
    const writingDirection: NonNullable<TextStyle["writingDirection"]> = rtl ? "rtl" : "ltr";
    return {
      rtl,
      textStart,
      writingDirection,
      /** Dates / codes stay LTR. */
      textLtr: "left" as const,
      textStyle: {
        textAlign: textStart,
        writingDirection,
      } as TextStyle,
      row: {
        flexDirection: (rtl ? "row-reverse" : "row") as ViewStyle["flexDirection"],
        alignItems: "center" as const,
      },
      menuAnchor: {
        // Menu button is on the start edge (right in RTL, left in LTR).
        alignItems: (rtl ? "flex-end" : "flex-start") as ViewStyle["alignItems"],
      },
    };
  }, [rtl]);
}
