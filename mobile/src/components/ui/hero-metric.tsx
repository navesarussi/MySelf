import React from "react";
import { Text } from "react-native";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card } from "../ui";

export function HeroMetric({
  label,
  value,
  tone = "default",
  align = "start",
  children,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "default";
  align?: "start" | "center";
  children?: React.ReactNode;
}) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const color = tone === "good" ? c.good : tone === "warn" ? c.warn : c.ink;
  const textAlign = align === "center" ? "center" : textStart;
  return (
    <Card style={{ paddingVertical: 16, marginBottom: 12 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600", textAlign, writingDirection }}>
        {label}
      </Text>
      <Text
        style={{
          color,
          fontWeight: "800",
          fontSize: 32,
          lineHeight: 38,
          marginTop: 2,
          textAlign,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {children}
    </Card>
  );
}
