import React from "react";
import { Pressable, Text, View } from "react-native";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

export type KpiItem = {
  id?: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "default";
  onPress?: () => void;
};

export function KpiGrid({ items }: { items: KpiItem[] }) {
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  return (
    <View style={{ ...row, flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "stretch" }}>
      {items.map((k, i) => {
        const color = k.tone === "good" ? c.good : k.tone === "warn" ? c.warn : c.ink;
        const inner = (
          <>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {k.label}
            </Text>
            <Text style={{ color, fontSize: 17, fontWeight: "800", marginTop: 2, textAlign: textStart }}>{k.value}</Text>
            {k.hint ? (
              <Text style={{ color: c.muted, fontSize: 10, marginTop: 2, textAlign: textStart, writingDirection }}>
                {k.hint}
              </Text>
            ) : null}
          </>
        );
        const tileStyle = {
          flexGrow: 1,
          flexBasis: "30%" as const,
          minWidth: 100,
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: tokens.radiusSm,
          padding: 10,
        };
        const key = k.id ?? `${k.label}-${i}`;
        return k.onPress ? (
          <Pressable
            key={key}
            onPress={k.onPress}
            accessibilityRole="button"
            style={({ pressed }) => [tileStyle, { opacity: pressed ? 0.85 : 1 }]}
          >
            {inner}
          </Pressable>
        ) : (
          <View key={key} style={tileStyle}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}
