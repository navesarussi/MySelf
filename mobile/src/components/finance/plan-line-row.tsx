import React, { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Chip, Row } from "../ui";
import { fmtAmount0, safeAmount } from "@/lib/finance/format";
import type { PlanLineType, PlanLineView } from "@/lib/finance/plan";

export function PlanLineRow({
  line,
  onSavePlanned,
  onChangeLineType,
  onDelete,
}: {
  line: PlanLineView;
  onSavePlanned: (id: string, amount: number) => void;
  onChangeLineType?: (id: string, lineType: PlanLineType) => void;
  onDelete?: () => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection, row, progressAlign } = useLayoutDir();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(String(line.planned_amount));
  const [draftType, setDraftType] = useState<PlanLineType>(line.line_type);

  const canToggleType = line.line_type === "fixed" || line.line_type === "variable";

  const pct =
    line.planned_amount > 0
      ? Math.min(100, (line.actual_amount / line.planned_amount) * 100)
      : line.actual_amount > 0
        ? 100
        : 0;
  const over = line.planned_amount > 0 && line.actual_amount > line.planned_amount;

  return (
    <>
      <Pressable
        onPress={() => {
          setDraft(String(line.planned_amount));
          setDraftType(line.line_type);
          setEditOpen(true);
        }}
      >
        <View style={{ marginBottom: 10 }}>
          <Row>
            <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }}>{line.name}</Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
              {t("finance.actual")} ₪{fmtAmount0(line.actual_amount)}
            </Text>
          </Row>
          <Row style={{ marginTop: 2 }}>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, flex: 1, textAlign: textStart, writingDirection }}>
              {t("finance.planned")} ₪{fmtAmount0(line.planned_amount)}
            </Text>
            {over ? (
              <Text style={{ color: c.warn, fontSize: tokens.textXs, fontWeight: "600" }}>
                +₪{fmtAmount0(safeAmount(line.actual_amount) - safeAmount(line.planned_amount))}
              </Text>
            ) : null}
          </Row>
          <View
            style={{
              height: 6,
              backgroundColor: c.border,
              borderRadius: 3,
              marginTop: 6,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 6,
                width: `${Math.max(pct, line.actual_amount > 0 ? 4 : 0)}%`,
                backgroundColor: over ? c.warn : c.accent,
                borderRadius: 3,
                alignSelf: progressAlign,
              }}
            />
          </View>
        </View>
      </Pressable>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}
          onPress={() => setEditOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: c.surface,
                borderRadius: tokens.radius,
                padding: tokens.padLg,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              <Text style={{ color: c.ink, fontWeight: "700", marginBottom: 8, textAlign: textStart, writingDirection }}>
                {line.name}
              </Text>
              <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 8, textAlign: textStart, writingDirection }}>
                {t("finance.editPlanned")}
              </Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                keyboardType="decimal-pad"
                style={{
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: tokens.radiusSm,
                  padding: 10,
                  color: c.ink,
                  fontSize: tokens.text,
                  textAlign: textStart,
                  writingDirection,
                }}
              />

              {canToggleType ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>
                    {t("finance.expenseTypeLabel")}
                  </Text>
                  <View style={{ ...row, gap: 8 }}>
                    <Chip
                      label={t("finance.expenseTypeFixed")}
                      active={draftType === "fixed"}
                      onPress={() => setDraftType("fixed")}
                    />
                    <Chip
                      label={t("finance.expenseTypeVariable")}
                      active={draftType === "variable"}
                      onPress={() => setDraftType("variable")}
                    />
                  </View>
                </View>
              ) : null}

              <View style={{ marginTop: 16, gap: 8 }}>
                <Btn
                  label={t("finance.saveCategory")}
                  onPress={() => {
                    const n = Number(draft);
                    if (Number.isFinite(n) && n >= 0) {
                      onSavePlanned(line.id, n);
                    }
                    if (canToggleType && draftType !== line.line_type && onChangeLineType) {
                      onChangeLineType(line.id, draftType);
                    }
                    setEditOpen(false);
                  }}
                />
                {onDelete ? (
                  <Btn
                    label={t("finance.deleteLine")}
                    variant="ghost"
                    onPress={() => {
                      onDelete();
                      setEditOpen(false);
                    }}
                  />
                ) : null}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
