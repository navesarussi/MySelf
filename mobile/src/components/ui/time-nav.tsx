import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

export function TimeNav({
  label,
  canGoPrev = true,
  canGoNext,
  onPrev,
  onNext,
  onLabelPress,
  prevLabel,
  nextLabel,
}: {
  label: string;
  canGoPrev?: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onLabelPress?: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const c = useColors();
  const { timeRow, writingDirection } = useLayoutDir();
  return (
    <View style={{ ...timeRow, justifyContent: "space-between", marginBottom: 12 }}>
      <Pressable
        onPress={onPrev}
        hitSlop={12}
        disabled={!canGoPrev}
        accessibilityRole="button"
        accessibilityLabel={prevLabel}
        style={{
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          opacity: canGoPrev ? 1 : 0.28,
        }}
      >
        <Ionicons name="chevron-back" size={20} color={c.accent} />
      </Pressable>
      <Pressable
        onPress={onLabelPress}
        disabled={!onLabelPress}
        accessibilityRole={onLabelPress ? "button" : undefined}
        style={{ flex: 1, paddingVertical: 8 }}
      >
        <Text
          style={{
            color: c.ink,
            fontWeight: "700",
            fontSize: tokens.text,
            textAlign: "center",
            writingDirection,
          }}
        >
          {label}
        </Text>
      </Pressable>
      <Pressable
        onPress={onNext}
        hitSlop={12}
        disabled={!canGoNext}
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        style={{
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          opacity: canGoNext ? 1 : 0.28,
        }}
      >
        <Ionicons name="chevron-forward" size={20} color={c.accent} />
      </Pressable>
    </View>
  );
}
