import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { moneyItemTypeFromTxn, type MoneyItemType } from "@/lib/finance/money-item-type";
import type { VariableTxnItem } from "@/lib/finance/variable-breakdown";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Input } from "../ui";
import { ApplyAllToggle } from "./apply-all-toggle";
import { CategoryPicker } from "./category-picker";
import { RememberRuleToggle } from "./categorize-controls";
import { MoneyItemTypeChips } from "./money-item-type-chips";
import { TxnDateTimeFields } from "./txn-datetime-fields";

export function VariableTxnEditModal({
  visible,
  txn,
  categories,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  txn: VariableTxnItem;
  categories: string[];
  onClose: () => void;
  onSave: (patch: {
    category: string | null;
    purpose_note: string | null;
    amount?: number;
    merchant?: string | null;
    description?: string | null;
    txn_date?: string;
    txn_time?: string | null;
    item_type?: MoneyItemType;
    remember_rule?: boolean;
    apply_to_all?: boolean;
    is_internal?: boolean;
  }) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [category, setCategory] = useState<string | null>(txn.category);
  const [note, setNote] = useState(txn.purpose_note ?? "");
  const [amount, setAmount] = useState(String(txn.amount));
  const [merchant, setMerchant] = useState(txn.merchant || txn.description || "");
  const [txnDate, setTxnDate] = useState(txn.txn_date);
  const [txnTime, setTxnTime] = useState(txn.txn_time ?? "");
  const [itemType, setItemType] = useState<MoneyItemType>(moneyItemTypeFromTxn(txn));
  const [rememberRule, setRememberRule] = useState(true);
  const [applyToAll, setApplyToAll] = useState(false);
  const [internal, setInternal] = useState(txn.is_internal);
  const [saving, setSaving] = useState(false);
  const canEditAmount = txn.source === "manual";

  useEffect(() => {
    setCategory(txn.category);
    setNote(txn.purpose_note ?? "");
    setAmount(String(txn.amount));
    setMerchant(txn.merchant || txn.description || "");
    setTxnDate(txn.txn_date);
    setTxnTime(txn.txn_time ?? "");
    setItemType(moneyItemTypeFromTxn(txn));
    setInternal(txn.is_internal);
  }, [txn]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }} onPress={saving ? undefined : onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: c.bg, borderRadius: tokens.radiusSm, padding: 18, borderWidth: 1, borderColor: c.border, maxHeight: "92%" }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, marginBottom: 10, textAlign: textStart, writingDirection }}>
              {t("finance.editTransaction")}
            </Text>
            <MoneyItemTypeChips value={itemType} onChange={setItemType} />
            <ApplyAllToggle value={applyToAll} onToggle={() => setApplyToAll((v) => !v)} />
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.editMerchant")}</Text>
            <Input value={merchant} onChangeText={setMerchant} editable={!saving} />
            {canEditAmount ? (
              <>
                <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.editAmount")}</Text>
                <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!saving} />
              </>
            ) : null}
            <View style={{ marginTop: 10 }}>
              <TxnDateTimeFields txnDate={txnDate} txnTime={txnTime} onDateChange={setTxnDate} onTimeChange={setTxnTime} />
            </View>
            <View style={{ marginTop: 10 }}>
              <CategoryPicker categories={categories} value={category} onChange={setCategory} allowEmpty />
            </View>
            <View style={{ marginTop: 10 }}>
              <RememberRuleToggle value={rememberRule} onToggle={() => setRememberRule((v) => !v)} />
            </View>
            <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.note")}</Text>
            <Input value={note} onChangeText={setNote} multiline editable={!saving} />
            <Pressable onPress={() => setInternal((v) => !v)} style={{ marginTop: 10 }}>
              <Text style={{ color: internal ? c.warn : c.muted, fontWeight: "600", textAlign: textStart, writingDirection }}>
                {internal ? t("finance.markedInternal") : t("finance.markInternal")}
              </Text>
            </Pressable>
            <View style={{ marginTop: 16, gap: 8 }}>
              <Btn
                label={saving ? t("common.saving") : t("common.save")}
                disabled={saving}
                onPress={async () => {
                  setSaving(true);
                  try {
                    const patch: Parameters<typeof onSave>[0] = {
                      category,
                      purpose_note: note.trim() || null,
                      item_type: itemType,
                      remember_rule: rememberRule,
                      apply_to_all: applyToAll,
                      is_internal: internal,
                      merchant: merchant.trim() || null,
                      description: merchant.trim() || null,
                      txn_date: txnDate,
                      txn_time: txnTime.trim() || null,
                    };
                    if (canEditAmount) {
                      const n = Number(amount);
                      if (!Number.isFinite(n) || n <= 0) return;
                      patch.amount = n;
                    }
                    await onSave(patch);
                  } finally {
                    setSaving(false);
                  }
                }}
              />
              <Btn
                label={t("common.delete")}
                variant="ghost"
                disabled={saving}
                onPress={async () => {
                  setSaving(true);
                  try {
                    await onDelete();
                  } finally {
                    setSaving(false);
                  }
                }}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
