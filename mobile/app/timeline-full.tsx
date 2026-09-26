import React, { useEffect, useState } from "react";
import type { TimelineEvent } from "@/lib/types";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { api } from "../src/api/resources";
import { useApiQuery, useTimelineEvents, queryKeys } from "../src/query";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors } from "../src/theme";
import { Loading } from "../src/components/ui";
import { TimelineCanvas } from "../src/components/timeline/timeline-canvas";
import { TimelineEventSheet } from "../src/components/timeline/event-sheet";

/** Immersive full-screen timeline. Opens in landscape — forced, so it works
 *  with the phone's rotation lock on, which is how most phones are set — with
 *  a button to switch between landscape and portrait; portrait is restored on
 *  exit. View-only (tap a marker to jump/zoom); editing lives on the main
 *  timeline screen. */
export default function TimelineFullScreen() {
  const c = useColors();
  const { t } = useI18n();
  const { row, textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const eventsQ = useTimelineEvents();
  const periodsQ = useApiQuery(queryKeys.periods, api.periods);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sheetEvents, setSheetEvents] = useState<TimelineEvent[] | null>(null);
  const [landscape, setLandscape] = useState(true);
  const canRotate = Platform.OS !== "web";

  useEffect(() => {
    if (!canRotate) return;
    ScreenOrientation.lockAsync(
      landscape ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  }, [canRotate, landscape]);

  useEffect(() => {
    if (!canRotate) return;
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [canRotate]);

  const events = eventsQ.events;
  const periods = periodsQ.data ?? [];
  const loading = (eventsQ.loading || periodsQ.loading) && events.length === 0;
  const wide = size.w > size.h;
  // Header (~36) + canvas controls (~40) + minimap (~48) + breathing room.
  const boardH = Math.max(size.h - insets.top - insets.bottom - (wide ? 132 : 150), 220);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View
        style={{
          ...row,
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: wide ? 2 : 8,
        }}
      >
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: "700", textAlign: textStart, writingDirection }}>
          {t("timeline.title")}
        </Text>
        <View style={{ ...row, gap: 4 }}>
          {canRotate ? (
            <Pressable
              onPress={() => setLandscape((v) => !v)}
              hitSlop={10}
              accessibilityLabel={landscape ? t("timeline.toPortrait") : t("timeline.toLandscape")}
              style={{ ...row, gap: 4, padding: 6 }}
            >
              <Ionicons name={landscape ? "phone-portrait-outline" : "phone-landscape-outline"} size={18} color={c.accent} />
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: "600", writingDirection }}>
                {landscape ? t("timeline.toPortrait") : t("timeline.toLandscape")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityLabel={t("timeline.exitFullscreen")}
            style={{ ...row, gap: 4, padding: 6 }}
          >
            <Ionicons name="contract-outline" size={18} color={c.muted} />
            <Text style={{ color: c.muted, fontSize: 12, writingDirection }}>{t("timeline.exitFullscreen")}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <TimelineCanvas
            events={events}
            periods={periods}
            height={boardH}
            fullscreen
            onEventPress={(ev) => setSheetEvents([ev])}
            onClusterPress={(evs) => setSheetEvents(evs)}
          />
        </View>
      )}

      <TimelineEventSheet events={sheetEvents} periods={periods} onClose={() => setSheetEvents(null)} />
    </View>
  );
}
