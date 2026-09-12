import React from "react";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, Row, SectionTitle } from "../ui";
import { PlanLineRow } from "./plan-line-row";
import type { PlanLineType, PlanSectionView } from "@/lib/finance/plan";

const SECTION_KEYS: Record<PlanLineType, string> = {
  income: "finance.sectionIncome",
  fixed: "finance.sectionFixed",
  variable: "finance.sectionVariable",
  planned: "finance.sectionPlanned",
  savings: "finance.sectionSavings",
};

export function PlanSectionBlock({
  section,
  onSavePlanned,
  onChangeLineType,
  onAdd,
  onDelete,
}: {
  section: PlanSectionView;
  onSavePlanned: (id: string, amount: number) => void;
  onChangeLineType?: (id: string, lineType: PlanLineType) => void;
  onAdd?: () => void;
  onDelete?: (id: string) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const canAdd = section.line_type === "planned" || section.line_type === "savings";

  return (
    <View style={{ marginBottom: 8 }}>
      <SectionTitle>{t(SECTION_KEYS[section.line_type])}</SectionTitle>
      <Card>
        <Row style={{ marginBottom: 8 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, flex: 1, textAlign: textStart, writingDirection }}>
            {t("finance.planned")}: ₪{section.planned_total.toFixed(0)}
          </Text>
          <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600" }}>
            {t("finance.actual")}: ₪{section.actual_total.toFixed(0)}
          </Text>
        </Row>
        {section.lines.length === 0 ? (
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
            {t("finance.noPlanLines")}
          </Text>
        ) : (
          section.lines.map((line) => (
            <PlanLineRow
              key={line.id}
              line={line}
              onSavePlanned={onSavePlanned}
              onChangeLineType={onChangeLineType}
              onDelete={canAdd && onDelete ? () => onDelete(line.id) : undefined}
            />
          ))
        )}
        {canAdd && onAdd ? (
          <Pressable onPress={onAdd} style={{ marginTop: 4 }}>
            <Text style={{ color: c.accent, fontWeight: "600", textAlign: textStart, writingDirection }}>
              + {section.line_type === "savings" ? t("finance.addSavings") : t("finance.addPlanned")}
            </Text>
          </Pressable>
        ) : null}
      </Card>
    </View>
  );
}
