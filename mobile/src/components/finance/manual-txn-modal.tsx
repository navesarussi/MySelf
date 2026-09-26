import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Chip, Input } from "../ui";
import { CategoryPicker } from "./category-picker";
import { MoneyItemTypeChips } from "./money-item-type-chips";
import { RememberRuleToggle } from "./categorize-controls";

export type ManualTxnPatch = {
  txn_date: string;
  amount: number;
  item_type: MoneyItemType;
  category: string | null;
  merchant: string | null;
  description: string | null;
  purpose_note: string | null;
  remember_rule: boolean;
  recurring: boolean;
  planned_amount?: number;
  charge_day?: number | null;
};

export function ManualTxnModal({
  visible,
  categories,
  defaultDate,
  onClose,
  onSave,
}: {
  visible: boolean;
  categories: string[];
  defaultDate: string;
  onClose: () => void;
  onSave: (patch: ManualTxnPatch) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const [itemType, setItemType] = useState<MoneyItemType>("variable");
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rememberRule, setRememberRule] = useState(true);
  const [recurring, setRecurring] = useState(false);
  const [chargeDay, setChargeDay] = useState("");
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }} onPress={saving ? undefined : onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: c.bg, borderRadius: tokens.radiusSm, padding: 18, borderWidth: 1, borderColor: c.border, maxHeight: "92%" }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, marginBottom: 10, textAlign: textStart, writingDirection }}>
              {t("finance.addManualTxn")}
            </Text>
            <MoneyItemTypeChips value={itemType} onChange={setItemType} />
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.txnDate")}</Text>
            <Input value={date} onChangeText={setDate} editable={!saving} />
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.editAmount")}</Text>
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!saving} />
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.editMerchant")}</Text>
            <Input value={merchant} onChangeText={setMerchant} editable={!saving} />
            <View style={{ marginTop: 10 }}>
              <CategoryPicker categories={categories} value={category} onChange={setCategory} allowEmpty />
            </View>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.note")}</Text>
            <Input value={note} onChangeText={setNote} multiline editable={!saving} />
            <RememberRuleToggle value={rememberRule} onToggle={() => setRememberRule((v) => !v)} />
            {itemType === "fixed" ? (
              <Pressable onPress={() => setRecurring((v) => !v)} style={{ marginBottom: 10 }}>
                <Text style={{ color: recurring ? c.good : c.muted, fontWeight: "600", textAlign: textStart, writingDirection }}>
                  {recurring ? t("finance.recurringOn") : t("finance.recurringOff")}
                </Text>
              </Pressable>
            ) : null}
            {recurring && itemType === "fixed" ? (
              <>
                <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.fixedChargeDay")}</Text>
                <Input value={chargeDay} onChangeText={setChargeDay} keyboardType="number-pad" editable={!saving} />
              </>
            ) : null}
            <View style={{ marginTop: 16, gap: 8 }}>
              <Btn
                label={saving ? t("common.saving") : t("common.save")}
                disabled={saving}
                onPress={async () => {
                  const n = Number(amount);
                  if (!Number.isFinite(n) || n <= 0) return;
                  setSaving(true);
                  try {
                    const ok = await onSave({
                      txn_date: date,
                      amount: n,
                      item_type: itemType,
                      category,
                      merchant: merchant.trim() || null,
                      description: merchant.trim() || null,
                      purpose_note: note.trim() || null,
                      remember_rule: rememberRule,
                      recurring: recurring && itemType === "fixed",
                      planned_amount: n,
                      charge_day: chargeDay.trim() ? Number(chargeDay) : null,
                    });
                    if (ok) onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
              />
              <Btn label={t("common.cancel")} variant="ghost" disabled={saving} onPress={onClose} />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
