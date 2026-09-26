import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import type { VariableTxnItem } from "@/lib/finance/variable-breakdown";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Input } from "../ui";
import { CategoryPicker } from "./category-picker";
import { RememberRuleToggle } from "./categorize-controls";

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
    expense_type?: "fixed" | "variable" | "savings" | null;
    remember_rule?: boolean;
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
  const [rememberRule, setRememberRule] = useState(true);
  const [internal, setInternal] = useState(txn.is_internal);
  const [saving, setSaving] = useState(false);
  const isManual = txn.source === "manual";

  useEffect(() => {
    setCategory(txn.category);
    setNote(txn.purpose_note ?? "");
    setAmount(String(txn.amount));
    setInternal(txn.is_internal);
  }, [txn]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 }} onPress={saving ? undefined : onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: c.bg, borderRadius: tokens.radiusSm, padding: 18, borderWidth: 1, borderColor: c.border }}>
          <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, marginBottom: 10, textAlign: textStart, writingDirection }}>
            {t("finance.editTransaction")}
          </Text>
          {isManual ? (
            <>
              <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.editAmount")}</Text>
              <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!saving} />
            </>
          ) : null}
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
                    remember_rule: rememberRule,
                    is_internal: internal,
                  };
                  if (isManual) {
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
