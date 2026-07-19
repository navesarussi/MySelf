import React, { useMemo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { homeStatColumns, homeStatTileWidth, HOME_STATS_GRID_GAP } from "@/lib/home-stats-grid";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";

export type HomeStatItem = {
  id: string;
  title: string;
  main: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  onPress: () => void;
};

const SCREEN_PAD = tokens.padLg * 2;

function StatTile({
  width,
  title,
  main,
  icon,
  accent,
  onPress,
}: HomeStatItem & { width: number }) {
  const c = useColors();
  const { writingDirection } = useLayoutDir();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ width, opacity: pressed ? 0.88 : 1 })}
    >
      <View
        style={{
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderTopWidth: 2,
          borderTopColor: accent,
          borderRadius: tokens.radiusSm,
          paddingVertical: 5,
          paddingHorizontal: 3,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 56,
        }}
      >
        <Ionicons name={icon} size={12} color={accent} />
        <Text
          style={{
            color: c.ink,
            fontSize: 16,
            fontWeight: "800",
            marginTop: 1,
            writingDirection,
          }}
        >
          {main}
        </Text>
        <Text
          style={{
            color: c.muted,
            fontSize: 9,
            fontWeight: "600",
            textAlign: "center",
            marginTop: 1,
            lineHeight: 11,
            writingDirection,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeStatsGrid({ items }: { items: HomeStatItem[] }) {
  const { width } = useWindowDimensions();
  const cols = useMemo(() => homeStatColumns(width, SCREEN_PAD), [width]);
  const tileW = useMemo(() => homeStatTileWidth(width, cols, SCREEN_PAD), [width, cols]);

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: HOME_STATS_GRID_GAP,
        marginBottom: 8,
      }}
    >
      {items.map((item) => (
        <StatTile key={item.id} {...item} width={tileW} />
      ))}
    </View>
  );
}
