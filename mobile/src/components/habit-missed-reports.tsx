import React from "react";
import { Text, View } from "react-native";
import { formatLocaleDate } from "@/lib/i18n/core";
import { missedReportDays } from "@/lib/habit-stats";
import type { Habit } from "@/lib/types";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Btn, Row } from "./ui";

export function HabitMissedReports({
  habit,
  busy,
  onBackfill,
}: {
  habit: Habit;
  busy?: boolean;
  onBackfill: (habit: Habit, date: string, type: "check_in" | "fall") => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const missed = missedReportDays(habit);
  if (missed.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: tokens.radiusSm,
        borderWidth: 1,
        borderColor: c.warn,
        backgroundColor: c.surface,
        gap: 8,
      }}
    >
      <Text style={{ color: c.warn, fontWeight: "700", fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
        {t("habits.missedReportsTitle", { count: missed.length })}
      </Text>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
        {t("habits.missedReportsHint")}
      </Text>
      {missed.map((day) => (
        <Row key={day} wrap style={{ justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600", textAlign: textStart, writingDirection }}>
            {formatLocaleDate(locale, day)}
          </Text>
          <Row style={{ gap: 6 }}>
            <Btn small label={t("habits.backfillSuccess")} onPress={() => onBackfill(habit, day, "check_in")} disabled={busy} />
            <Btn
              small
              variant="warn"
              label={t("habits.backfillFall")}
              onPress={() => onBackfill(habit, day, "fall")}
              disabled={busy}
            />
          </Row>
        </Row>
      ))}
    </View>
  );
}
