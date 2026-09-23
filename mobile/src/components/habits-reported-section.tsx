import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Habit } from "@/lib/types";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { HabitCard } from "./habit-card";
import { Row } from "./ui";

export function HabitsReportedSection({
  habits,
  expanded,
  onToggle,
  isPending,
  onPress,
  onEdit,
  onReset,
  onCheckIn,
  onReportFall,
}: {
  habits: Habit[];
  expanded: boolean;
  onToggle: () => void;
  isPending: (id: string) => boolean;
  onPress: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onReset: (habit: Habit) => void;
  onCheckIn: (habit: Habit) => void;
  onReportFall: (habit: Habit) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();

  if (habits.length === 0) return null;

  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          {
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: tokens.radiusSm,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surface,
            opacity: pressed ? tokens.press : 1,
          },
        ]}
      >
        <Row style={{ justifyContent: "space-between", gap: 8 }}>
          <Text
            style={{
              color: c.ink,
              fontSize: tokens.textSm,
              fontWeight: "600",
              flex: 1,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {t("habits.reportedTodaySection", { count: habits.length })}
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
        </Row>
      </Pressable>
      {expanded ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          {habits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              busy={isPending(habit.id)}
              onPress={onPress}
              onEdit={onEdit}
              onReset={onReset}
              onCheckIn={onCheckIn}
              onReportFall={onReportFall}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
