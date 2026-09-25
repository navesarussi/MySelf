import React from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import type { Habit } from "@/lib/types";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, SectionTitle } from "../ui";
import { HabitCard } from "../habit-card";

export function HomeHabitsFeed({
  uniqueCount,
  pending,
  failureTotal,
  busy,
  onCheckIn,
  onReportFall,
  onReset,
  onOpenHabit,
}: {
  uniqueCount: number;
  pending: Habit[];
  failureTotal: number;
  busy: (id: string) => boolean;
  onCheckIn: (habit: Habit) => void | Promise<void>;
  onReportFall: (habit: Habit) => void | Promise<void>;
  onReset: (habit: Habit) => void | Promise<void>;
  onOpenHabit: (habit: Habit) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  return (
    <>
      <SectionTitle onPress={() => router.push("/habits")}>{t("home.habitTracking")}</SectionTitle>
      {uniqueCount === 0 ? (
        <Card>
          <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.noHabits")}</Text>
        </Card>
      ) : pending.length === 0 ? (
        <Card>
          <Text style={{ color: c.muted, textAlign: textStart, writingDirection }}>{t("home.allHabitsReportedToday")}</Text>
        </Card>
      ) : (
        pending.map((h) => (
          <HabitCard
            key={h.id}
            habit={h}
            busy={busy(h.id)}
            onPress={() => onOpenHabit(h)}
            onCheckIn={() => onCheckIn(h)}
            onReportFall={() => onReportFall(h)}
            onReset={() => onReset(h)}
          />
        ))
      )}
      {failureTotal > 0 ? (
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.textXs,
            textAlign: textStart,
            writingDirection,
            marginBottom: 8,
          }}
        >
          {t("common.totalFailures")}: {failureTotal}
        </Text>
      ) : null}
    </>
  );
}
