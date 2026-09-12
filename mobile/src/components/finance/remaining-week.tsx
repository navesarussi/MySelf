import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card } from "../ui";
import type { WeeklyPace } from "@/lib/finance/weekly";

export function RemainingWeekCard({ pace }: { pace: WeeklyPace }) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const over = pace.left < 0;
  return (
    <Card>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
        {t("finance.thisWeek", { week: String(pace.week) })}
      </Text>
      <Text
        style={{
          color: over ? c.warn : c.accent,
          fontWeight: "800",
          fontSize: tokens.title,
          marginTop: 4,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {over
          ? t("finance.overWeekly", { amount: Math.abs(pace.left).toFixed(0) })
          : t("finance.leftThisWeek", { amount: pace.left.toFixed(0) })}
      </Text>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}>
        {t("finance.weeklyPaceHint", {
          spent: pace.spent.toFixed(0),
          budget: pace.variable_budget.toFixed(0),
        })}
      </Text>
    </Card>
  );
}
