import React, { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Row } from "../ui";
import type { PlanLineView } from "@/lib/finance/plan";

export function PlanLineRow({
  line,
  onSavePlanned,
  onDelete,
}: {
  line: PlanLineView;
  onSavePlanned: (id: string, amount: number) => void;
  onDelete?: () => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(String(line.planned_amount));

  const pct =
    line.planned_amount > 0
      ? Math.min(100, (line.actual_amount / line.planned_amount) * 100)
      : line.actual_amount > 0
        ? 100
        : 0;
  const over = line.planned_amount > 0 && line.actual_amount > line.planned_amount;

  return (
    <>
      <Pressable onPress={() => { setDraft(String(line.planned_amount)); setEditOpen(true); }}>
        <View style={{ marginBottom: 10 }}>
          <Row>
            <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }}>{line.name}</Text>
            <Text style={{ color: c.muted, fontSize: tokens.textXs }}>
              {t("finance.actual")} ₪{line.actual_amount.toFixed(0)}
            </Text>
          </Row>
          <Row style={{ marginTop: 2 }}>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, flex: 1, textAlign: textStart, writingDirection }}>
              {t("finance.planned")} ₪{line.planned_amount.toFixed(0)}
            </Text>
            {over ? (
              <Text style={{ color: c.warn, fontSize: tokens.textXs, fontWeight: "600" }}>
                +₪{(line.actual_amount - line.planned_amount).toFixed(0)}
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
              <View style={{ marginTop: 12, gap: 8 }}>
                <Btn
                  label={t("finance.saveCategory")}
                  onPress={() => {
                    const n = Number(draft);
                    if (Number.isFinite(n) && n >= 0) {
                      onSavePlanned(line.id, n);
                      setEditOpen(false);
                    }
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
