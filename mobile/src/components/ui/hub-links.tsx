import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

export type HubLink = {
  href: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export function HubLinks({ links }: { links: HubLink[] }) {
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const router = useRouter();
  return (
    <View style={{ ...row, flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "stretch" }}>
      {links.map((link) => (
        <Pressable
          key={link.href}
          onPress={() => router.push(link.href as `/${string}`)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexGrow: 1,
            flexBasis: "30%",
            minWidth: 104,
            backgroundColor: pressed ? c.border : c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: tokens.radiusSm,
            padding: 10,
          })}
        >
          <View style={{ ...row, gap: 6 }}>
            <Ionicons name={link.icon} size={17} color={c.accent} />
            <Text
              style={{
                flex: 1,
                color: c.ink,
                fontSize: tokens.textXs,
                fontWeight: "600",
                textAlign: textStart,
                writingDirection,
              }}
            >
              {link.label}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
