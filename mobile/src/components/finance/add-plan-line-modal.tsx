import React, { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn } from "../ui";
import type { PlanLineType } from "@/lib/finance/expense-type";

export function AddPlanLineModal({
  visible,
  lineType,
  onClose,
  onSave,
}: {
  visible: boolean;
  lineType: PlanLineType;
  onClose: () => void;
  onSave: (name: string, amount: number) => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  function submit() {
    const n = Number(amount);
    if (!name.trim() || !Number.isFinite(n) || n < 0) return;
    onSave(name.trim(), n);
    setName("");
    setAmount("");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}
        onPress={onClose}
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
            <Text style={{ color: c.ink, fontWeight: "700", marginBottom: 12, textAlign: textStart, writingDirection }}>
              {lineType === "savings" ? t("finance.addSavings") : t("finance.addPlanned")}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("finance.lineNamePlaceholder")}
              placeholderTextColor={c.muted}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: tokens.radiusSm,
                padding: 10,
                color: c.ink,
                marginBottom: 8,
                textAlign: textStart,
                writingDirection,
              }}
            />
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder={t("finance.editPlanned")}
              placeholderTextColor={c.muted}
              keyboardType="decimal-pad"
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: tokens.radiusSm,
                padding: 10,
                color: c.ink,
                marginBottom: 12,
                textAlign: textStart,
                writingDirection,
              }}
            />
            <Btn label={t("finance.saveCategory")} onPress={submit} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
