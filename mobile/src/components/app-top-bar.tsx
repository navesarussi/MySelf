import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";

export function AppTopBar({ onMenuPress }: { onMenuPress: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const { direction, textStart, row } = useLayoutDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: c.surface,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}
    >
      <View
        style={{
          ...row,
          paddingHorizontal: tokens.pad,
          paddingVertical: 10,
          gap: 8,
        }}
      >
        <Text
          style={{
            flex: 1,
            color: c.ink,
            fontSize: 18,
            fontWeight: "700",
            textAlign: textStart,
          }}
          numberOfLines={1}
        >
          {t("nav.brand")}
        </Text>
        <View style={{ ...row, gap: 4 }}>
          <Pressable
            onPress={onMenuPress}
            accessibilityRole="button"
            accessibilityLabel={t("nav.menu")}
            hitSlop={8}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: tokens.radiusSm,
              backgroundColor: pressed ? c.border + "80" : "transparent",
            })}
          >
            <Ionicons name="menu-outline" size={22} color={c.ink} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel={t("nav.settings")}
            hitSlop={8}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: tokens.radiusSm,
              backgroundColor: pressed ? c.border + "80" : "transparent",
            })}
          >
            <Ionicons name="settings-outline" size={22} color={c.ink} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
