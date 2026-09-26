import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLayoutDir } from "../../layout-dir";
import { useColors } from "../../theme";

/** RTL-safe section header with chevron that stays in bounds. */
export function CollapsibleSectionHeader({
  title,
  collapsed,
  onPress,
  trailing,
}: {
  title: string;
  collapsed: boolean;
  onPress: () => void;
  trailing?: React.ReactNode;
}) {
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View style={{ ...row, alignItems: "center", marginTop: 14, marginBottom: 8, gap: 8 }}>
        <Text
          style={{
            flex: 1,
            minWidth: 0,
            color: c.ink,
            fontSize: 16,
            fontWeight: "700",
            textAlign: textStart,
            writingDirection,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {trailing}
        <Ionicons
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={18}
          color={c.muted}
          style={{ flexShrink: 0 }}
        />
      </View>
    </Pressable>
  );
}
