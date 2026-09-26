import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { fmtIls0 } from "@/lib/finance/format";
import { localeTag } from "@/lib/i18n/core";
import type { PlanLineType, PlanSectionView } from "@/lib/finance/plan";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, Row } from "../ui";
import { PlanLineRow } from "./plan-line-row";

const SECTION_KEYS: Record<PlanLineType, string> = {
  income: "finance.sectionIncome",
  fixed: "finance.sectionFixed",
  variable: "finance.sectionVariable",
  planned: "finance.sectionPlanned",
  savings: "finance.sectionSavings",
};

export function PlanSectionBlock({
  section,
  month,
  onSavePlanned,
  onChangeLineType,
  onAdd,
  onDelete,
}: {
  section: PlanSectionView;
  month?: string;
  onSavePlanned: (id: string, amount: number) => void;
  onChangeLineType?: (id: string, lineType: PlanLineType) => void;
  onAdd?: () => void;
  onDelete?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const router = useRouter();
  const loc = localeTag(locale);
  const canAdd = section.line_type === "planned" || section.line_type === "savings";
  const isIncome = section.line_type === "income";
  const variance = section.actual_total - section.planned_total;
  const varianceTone = isIncome ? (variance >= 0 ? c.good : c.warn) : variance > 0 ? c.warn : c.good;

  function openIncomeBreakdown() {
    if (!month) return;
    router.push(`/finance-income?month=${month}` as `/${string}`);
  }

  return (
    <View style={{ marginBottom: 8 }}>
      {isIncome ? (
        <Pressable onPress={openIncomeBreakdown} accessibilityRole="button">
          <View style={{ ...row, alignItems: "center", marginTop: 14, marginBottom: 8, gap: 8 }}>
            <Text
              style={{
                flex: 1,
                minWidth: 0,
                color: c.accent,
                fontSize: 16,
                fontWeight: "700",
                textAlign: textStart,
                writingDirection,
              }}
              numberOfLines={1}
            >
              {t(SECTION_KEYS[section.line_type])}
            </Text>
            <Ionicons name="chevron-back" size={16} color={c.accent} style={{ flexShrink: 0 }} />
          </View>
        </Pressable>
      ) : (
        <Text
          style={{
            color: c.ink,
            fontSize: 16,
            fontWeight: "700",
            marginTop: 14,
            marginBottom: 8,
            textAlign: textStart,
            writingDirection,
          }}
        >
          {t(SECTION_KEYS[section.line_type])}
        </Text>
      )}
      <Pressable onPress={isIncome ? openIncomeBreakdown : undefined} disabled={!isIncome}>
        <Card>
          <Row style={{ marginBottom: 8 }}>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, flex: 1, minWidth: 0, textAlign: textStart, writingDirection }}>
              {t("finance.planned")}: {fmtIls0(section.planned_total, loc)}
            </Text>
            <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600", flexShrink: 0, writingDirection: "ltr" }}>
              {t("finance.actual")}: {fmtIls0(section.actual_total, loc)}
            </Text>
          </Row>
          {isIncome && section.planned_total > 0 ? (
            <Text style={{ color: varianceTone, fontSize: tokens.textXs, fontWeight: "700", marginBottom: 8, textAlign: textStart, writingDirection }}>
              {variance >= 0 ? "+" : "−"}
              {fmtIls0(Math.abs(variance), loc)} {t("finance.incomeVariance")}
            </Text>
          ) : null}
          {section.lines.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {isIncome ? t("finance.incomeTapHint") : t("finance.noPlanLines")}
            </Text>
          ) : (
            section.lines.slice(0, isIncome ? 3 : section.lines.length).map((line) => (
              <PlanLineRow
                key={line.id}
                line={line}
                onSavePlanned={onSavePlanned}
                onChangeLineType={onChangeLineType}
                onDelete={canAdd && onDelete ? () => onDelete(line.id) : undefined}
              />
            ))
          )}
          {isIncome && section.lines.length > 3 ? (
            <Text style={{ color: c.accent, fontSize: tokens.textXs, fontWeight: "600", marginTop: 4, textAlign: textStart, writingDirection }}>
              {t("finance.incomeViewAll", { count: section.lines.length })}
            </Text>
          ) : null}
          {canAdd && onAdd ? (
            <Pressable onPress={onAdd} style={{ marginTop: 4 }}>
              <Text style={{ color: c.accent, fontWeight: "600", textAlign: textStart, writingDirection }}>
                + {section.line_type === "savings" ? t("finance.addSavings") : t("finance.addPlanned")}
              </Text>
            </Pressable>
          ) : null}
        </Card>
      </Pressable>
    </View>
  );
}
