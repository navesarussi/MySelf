import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { TimelineCanvas } from "./timeline/timeline-canvas";
import type { LifePeriod } from "@/lib/life-periods";
import type { TimelineEvent } from "@/lib/types";

/** Inline timeline on the main screen: the cinematic gesture canvas plus a
 *  button to open the immersive full-screen (landscape-capable) view. */
export function TimelineVisual({
  events,
  periods,
  onEventPress,
  onPeriodPress,
  onClusterPress,
}: {
  events: TimelineEvent[];
  periods: LifePeriod[];
  onEventPress: (ev: TimelineEvent) => void;
  onPeriodPress: (p: LifePeriod) => void;
  onClusterPress?: (events: TimelineEvent[]) => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { row, writingDirection } = useLayoutDir();
  const router = useRouter();

  return (
    <View>
      <View style={{ ...row, justifyContent: "flex-start", marginBottom: 8 }}>
        <Pressable
          onPress={() => router.push("/timeline-full")}
          hitSlop={6}
          style={{
            ...row,
            gap: 5,
            borderWidth: 1,
            borderColor: c.accent + "55",
            backgroundColor: c.accent + "18",
            borderRadius: tokens.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Ionicons name="expand-outline" size={15} color={c.accent} />
          <Text style={{ color: c.accent, fontSize: tokens.textXs, fontWeight: "700" }}>
            {t("timeline.fullscreen")}
          </Text>
        </Pressable>
      </View>

      <TimelineCanvas
        events={events}
        periods={periods}
        height={360}
        onEventPress={onEventPress}
        onPeriodPress={onPeriodPress}
        onClusterPress={onClusterPress}
      />
    </View>
  );
}
