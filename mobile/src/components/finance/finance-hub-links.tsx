import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

const LINKS = [
  { href: "/finance-planning", labelKey: "finance.hubPlanning", icon: "trending-up-outline" as const },
  { href: "/finance-wealth", labelKey: "finance.hubWealth", icon: "pie-chart-outline" as const },
];

export function FinanceHubLinks() {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const router = useRouter();

  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
      {LINKS.map((link) => (
        <Pressable
          key={link.href}
          onPress={() => router.push(link.href as `/${string}`)}
          accessibilityRole="button"
          style={{
            flex: 1,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: tokens.radiusSm,
            padding: 12,
          }}
        >
          <View style={{ ...row, gap: 8, alignItems: "center" }}>
            <Ionicons name={link.icon} size={18} color={c.accent} />
            <Text
              style={{
                color: c.ink,
                fontWeight: "600",
                fontSize: tokens.textXs,
                flex: 1,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t(link.labelKey)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
