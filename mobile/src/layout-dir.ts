import { useMemo } from "react";
import { I18nManager, type TextStyle, type ViewStyle } from "react-native";
import { useI18n } from "./i18n";

/**
 * Locale-aware layout helpers with physical left/right results.
 *
 * React Native swaps the meaning of `left`/`right` and `row`/`row-reverse`
 * when `I18nManager.isRTL` is true. We compensate for that so Hebrew is always
 * visually right-aligned and English always left-aligned, regardless of the
 * native RTL flag (which may lag until an app restart).
 */
export function useLayoutDir() {
  const { rtl } = useI18n();

  return useMemo(() => {
    const nativeSwaps = I18nManager.isRTL;
    // Want physical right for Hebrew, physical left for English.
    const textStart: NonNullable<TextStyle["textAlign"]> =
      rtl === nativeSwaps ? "left" : "right";
    // Want children to flow from the start edge (right in Hebrew).
    const flexDirection: NonNullable<ViewStyle["flexDirection"]> =
      rtl === nativeSwaps ? "row" : "row-reverse";

    const writingDirection: NonNullable<TextStyle["writingDirection"]> = rtl ? "rtl" : "ltr";

    return {
      rtl,
      textStart,
      writingDirection,
      /** Dates / codes stay physically LTR. */
      textLtr: (nativeSwaps ? "right" : "left") as const,
      textStyle: {
        textAlign: textStart,
        writingDirection,
      } as TextStyle,
      row: {
        flexDirection,
        alignItems: "center" as const,
      },
      menuAnchor: {
        // Menu sits on the start edge: physical right in Hebrew, left in English.
        alignItems: (rtl ? "flex-end" : "flex-start") as ViewStyle["alignItems"],
      },
    };
  }, [rtl]);
}
