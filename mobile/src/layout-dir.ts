import { useMemo } from "react";
import { I18nManager, Platform, type TextStyle, type ViewStyle } from "react-native";
import {
  chevronBackName,
  chevronForwardName,
  physicalAlignEnd,
  physicalAlignStart,
  physicalTextStart,
  progressAlignSelf,
  rowFlexDirection,
} from "@/lib/layout-dir";
import { useI18n } from "./i18n";

export function useLayoutDir() {
  const { rtl } = useI18n();

  return useMemo(() => {
    const nativeSwaps = I18nManager.isRTL;
    const cssDirFollowsLocale = Platform.OS === "web";
    const engine = { rtl, nativeSwaps, cssDirFollowsLocale };
    const textStart = physicalTextStart(engine);
    const writingDirection: NonNullable<TextStyle["writingDirection"]> = rtl ? "rtl" : "ltr";
    const flexDirection = rowFlexDirection(engine);
    const alignStart = physicalAlignStart(engine);
    const alignEnd = physicalAlignEnd(engine);

    return {
      rtl,
      textStart,
      writingDirection,
      textLtr: (nativeSwaps ? "right" : "left") as TextStyle["textAlign"],
      textStyle: { textAlign: textStart, writingDirection } as TextStyle,
      row: { flexDirection, alignItems: "center" as const },
      timeRow: {
        flexDirection: "row" as const,
        direction: "ltr" as const,
        alignItems: "center" as const,
      },
      alignStart,
      alignEnd,
      progressAlign: progressAlignSelf(engine),
      chevronBack: chevronBackName(rtl),
      chevronForward: chevronForwardName(rtl),
      menuAnchor: {
        alignItems: (rtl ? "flex-end" : "flex-start") as ViewStyle["alignItems"],
      },
    };
  }, [rtl]);
}
