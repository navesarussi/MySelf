import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import { api } from "../src/api/resources";
import { useApi } from "../src/hooks";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors } from "../src/theme";
import { Loading } from "../src/components/ui";
import { TimelineCanvas } from "../src/components/timeline/timeline-canvas";

/** Immersive full-screen timeline. Allows landscape while open, restores
 *  portrait on exit. View-only (tap a marker to jump/zoom); editing lives on
 *  the main timeline screen. */
export default function TimelineFullScreen() {
  const c = useColors();
  const { t } = useI18n();
  const { row, textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const eventsQ = useApi(api.timelineEvents);
  const periodsQ = useApi(api.periods);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const events = eventsQ.data ?? [];
  const periods = periodsQ.data ?? [];
  const loading = (eventsQ.loading || periodsQ.loading) && !eventsQ.data;

  return (
    <View
      style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <View
        style={{
          ...row,
          justifyContent: "space-between",
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: "700", textAlign: textStart, writingDirection }}>
          {t("timeline.title")}
        </Text>
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

      {loading ? (
        <Loading />
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <TimelineCanvas
            events={events}
            periods={periods}
            height={Math.max(size.h - insets.top - insets.bottom - 150, 240)}
            fullscreen
          />
          <Text style={{ color: c.muted, fontSize: 11, textAlign: "center", marginTop: 4 }}>
            {t("timeline.rotateHint")}
          </Text>
        </View>
      )}
    </View>
  );
}
