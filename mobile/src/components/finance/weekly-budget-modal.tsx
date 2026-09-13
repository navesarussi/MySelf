import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Input } from "../ui";
import type { WeeklyPace } from "@/lib/finance/weekly";

export function WeeklyBudgetModal({
  visible,
  pace,
  onClose,
  onSave,
}: {
  visible: boolean;
  pace: WeeklyPace;
  onClose: () => void;
  onSave: (amount: number | null) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [value, setValue] = useState(String(pace.variable_budget));

  function submit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    onSave(n);
    onClose();
  }

  function resetComputed() {
    onSave(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: c.bg,
            borderRadius: tokens.radiusSm,
            padding: 20,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text
            style={{
              color: c.ink,
              fontWeight: "700",
              fontSize: tokens.title,
              marginBottom: 8,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {t("finance.editWeeklyBudget")}
          </Text>
          <Text
            style={{
              color: c.muted,
              fontSize: tokens.textXs,
              marginBottom: 12,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {t("finance.weeklyBudgetFormula", { amount: pace.computed_budget.toFixed(0) })}
          </Text>
          <Input value={value} onChangeText={setValue} placeholder="0" keyboardType="numeric" />
          <View style={{ marginTop: 14, gap: 8 }}>
            <Btn label={t("common.save")} onPress={submit} />
            {pace.is_override ? (
              <Btn label={t("finance.resetWeeklyBudget")} variant="ghost" onPress={resetComputed} />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
