import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors, tokens } from "../theme";
import { useLayoutDir } from "../layout-dir";
import { Row } from "./ui";

export function StatTile({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  label: string;
  value: number;
}) {
  const c = useColors();
  const { writingDirection } = useLayoutDir();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 70,
        backgroundColor: c.border + "40",
        borderRadius: tokens.radiusSm,
        paddingVertical: 8,
        paddingHorizontal: 4,
        alignItems: "center",
      }}
    >
      <Row style={{ gap: 3, justifyContent: "center" }}>
        <Ionicons name={icon} size={12} color={iconColor} />
        <Text style={{ color: c.muted, fontSize: tokens.textXs, writingDirection }} numberOfLines={1}>
          {label}
        </Text>
      </Row>
      <Text style={{ color: c.ink, fontWeight: "800", fontSize: 17, marginTop: 2, writingDirection }}>
        {value}
      </Text>
    </View>
  );
}
