import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fmtAmount0, safeAmount } from "@/lib/finance/format";
import { normalizeWeeklyPace, type WeeklyPace } from "@/lib/finance/weekly";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card } from "../ui";
import { ProgressBar } from "../ui/progress-bar";
import { WeeklyBudgetModal } from "./weekly-budget-modal";

export function RemainingWeekCard({
  pace: rawPace,
  onEditBudget,
}: {
  pace: WeeklyPace;
  onEditBudget?: (amount: number | null) => void;
}) {
  const pace = normalizeWeeklyPace(rawPace);
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [showEdit, setShowEdit] = useState(false);
  if (!pace) return null;

  const variableBudget = safeAmount(pace.variable_budget);
  const spent = safeAmount(pace.spent);
  const left = safeAmount(pace.left, variableBudget - spent);
  const over = left < 0;
  const ratio = variableBudget > 0 ? Math.min(1, spent / variableBudget) : 0;

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
              ? t("finance.overWeekly", { amount: fmtAmount0(Math.abs(left)) })
              : t("finance.leftThisWeek", { amount: fmtAmount0(left) })}
          </Text>
          <View style={{ marginTop: 10 }}>
            <ProgressBar ratio={ratio} tone={over ? "warn" : "accent"} />
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
              spent: fmtAmount0(spent),
              budget: fmtAmount0(variableBudget),
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
      {onEditBudget && showEdit && pace ? (
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
