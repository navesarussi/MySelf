import React from "react";
import { View } from "react-native";
import { useLayoutDir } from "../../layout-dir";
import { useColors } from "../../theme";

export function ProgressBar({
  ratio,
  tone = "accent",
}: {
  ratio: number;
  tone?: "accent" | "warn" | "good";
}) {
  const c = useColors();
  const { progressAlign } = useLayoutDir();
  const color = tone === "warn" ? c.warn : tone === "good" ? c.good : c.accent;
  const width = `${Math.max(4, Math.min(1, Number.isFinite(ratio) ? ratio : 0) * 100)}%` as `${number}%`;
  return (
    <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, overflow: "hidden" }}>
      <View
        style={{
          height: 6,
          width,
          backgroundColor: color,
          borderRadius: 3,
          alignSelf: progressAlign,
        }}
      />
    </View>
  );
}
