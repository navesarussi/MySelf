import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

export function FinanceMonthNav({
  label,
  canGoPrev = true,
  canGoNext,
  onPrev,
  onNext,
  onLabelPress,
}: {
  label: string;
  canGoPrev?: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** e.g. jump back to the current month */
  onLabelPress?: () => void;
}) {
  const c = useColors();
  const { row, writingDirection } = useLayoutDir();
  return (
    <View style={{ ...row, justifyContent: "space-between", marginBottom: 12 }}>
      <Pressable
        onPress={onPrev}
        hitSlop={12}
        disabled={!canGoPrev}
        accessibilityRole="button"
        accessibilityLabel="חודש קודם"
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
        accessibilityLabel="חודש הבא"
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
