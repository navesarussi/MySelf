import React from "react";
import { Pressable, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { getAppVersion } from "../version";

/** Top bar: menu (start) · brand title (center) · settings (end). */
export function AppTopBar({ onMenuPress }: { onMenuPress: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const { writingDirection, row } = useLayoutDir();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isHome = pathname === "/" || pathname === "/index" || pathname.endsWith("/(tabs)");
  const version = getAppVersion();

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
          paddingVertical: 8,
          minHeight: 44,
        }}
      >
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

        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
          }}
        >
          {!isHome ? (
            <>
              <Text
                style={{
                  color: c.ink,
                  fontSize: 17,
                  fontWeight: "700",
                  textAlign: "center",
                  writingDirection,
                }}
                numberOfLines={1}
              >
                {t("nav.brand")}
              </Text>
              <Text
                style={{
                  color: c.muted,
                  fontSize: 10,
                  fontWeight: "400",
                  textAlign: "center",
                  writingDirection,
                  marginTop: 1,
                }}
                numberOfLines={1}
              >
                v{version}
              </Text>
            </>
          ) : null}
        </View>

        <View style={{ ...row, gap: 4 }}>
          <Pressable
            onPress={() => router.push("/agent-chat")}
            accessibilityRole="button"
            accessibilityLabel={t("agent.title")}
            hitSlop={8}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: tokens.radiusSm,
              backgroundColor: pressed ? c.border + "80" : "transparent",
            })}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={c.ink} />
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
