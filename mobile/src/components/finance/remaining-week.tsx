import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card } from "../ui";
import type { WeeklyPace } from "@/lib/finance/weekly";
import { WeeklyBudgetModal } from "./weekly-budget-modal";

export function RemainingWeekCard({
  pace,
  onEditBudget,
}: {
  pace: WeeklyPace;
  onEditBudget?: (amount: number | null) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [showEdit, setShowEdit] = useState(false);
  const over = pace.left < 0;
  const ratio = pace.variable_budget > 0 ? Math.min(1, pace.spent / pace.variable_budget) : 0;

  return (
    <>
      <Pressable onPress={() => onEditBudget && setShowEdit(true)} disabled={!onEditBudget}>
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.thisWeek", { week: String(pace.week) })}
            {pace.is_override ? ` · ${t("finance.customBudget")}` : ""}
          </Text>
          <Text
            style={{
              color: over ? c.warn : c.accent,
              fontWeight: "800",
              fontSize: 20,
              marginTop: 4,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {over
              ? t("finance.overWeekly", { amount: Math.abs(pace.left).toFixed(0) })
              : t("finance.leftThisWeek", { amount: pace.left.toFixed(0) })}
          </Text>
          <View
            style={{
              height: 6,
              backgroundColor: c.border,
              borderRadius: 3,
              marginTop: 10,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 6,
                width: `${Math.max(4, ratio * 100)}%`,
                backgroundColor: over ? c.warn : c.accent,
                borderRadius: 3,
              }}
            />
          </View>
          <Text
            style={{
              color: c.muted,
              fontSize: tokens.textXs,
              marginTop: 6,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {t("finance.weeklyPaceHint", {
              spent: pace.spent.toFixed(0),
              budget: pace.variable_budget.toFixed(0),
            })}
          </Text>
          {onEditBudget ? (
            <Text
              style={{
                color: c.accent,
                fontSize: tokens.textXs,
                marginTop: 8,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t("finance.tapToEditWeekly")}
            </Text>
          ) : null}
        </Card>
      </Pressable>
      {onEditBudget ? (
        <WeeklyBudgetModal
          visible={showEdit}
          pace={pace}
          onClose={() => setShowEdit(false)}
          onSave={onEditBudget}
        />
      ) : null}
    </>
  );
}
