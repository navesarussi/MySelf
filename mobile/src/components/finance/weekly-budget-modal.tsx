import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { fmtAmount0, safeAmount } from "@/lib/finance/format";
import { normalizeWeeklyPace, resolveWeeklyBudgetOverrideValue, type WeeklyPace } from "@/lib/finance/weekly";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Input } from "../ui";

export function WeeklyBudgetModal({
  visible,
  pace: rawPace,
  saving,
  error,
  onClose,
  onSave,
  onRetry,
}: {
  visible: boolean;
  pace: WeeklyPace;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (amount: number | null) => void | Promise<void>;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const pace = normalizeWeeklyPace(rawPace);
  const [value, setValue] = useState("0");

  useEffect(() => {
    if (visible && pace) {
      setValue(String(safeAmount(pace.variable_budget)));
    }
  }, [visible, pace]);

  if (!visible || !pace) return null;

  const computed = safeAmount(pace.computed_budget, safeAmount(pace.variable_budget));

  async function submit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    const normalized = resolveWeeklyBudgetOverrideValue(n, computed);
    await onSave(normalized ?? n);
  }

  async function resetComputed() {
    await onSave(null);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}
        onPress={saving ? undefined : onClose}
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
            {t("finance.weeklyBudgetFormula", { amount: fmtAmount0(computed) })}
          </Text>
          <Input value={value} onChangeText={setValue} placeholder="0" keyboardType="numeric" editable={!saving} />
          {error ? (
            <View style={{ marginTop: 10, gap: 8 }}>
              <Text style={{ color: c.warn, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
                {error}
              </Text>
              {onRetry ? <Btn label={t("common.retry")} variant="ghost" onPress={onRetry} /> : null}
            </View>
          ) : null}
          <View style={{ marginTop: 14, gap: 8 }}>
            <Btn label={saving ? t("common.saving") : t("common.save")} onPress={() => void submit()} disabled={saving} />
            {pace.is_override ? (
              <Btn label={t("finance.resetWeeklyBudget")} variant="ghost" onPress={() => void resetComputed()} disabled={saving} />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
