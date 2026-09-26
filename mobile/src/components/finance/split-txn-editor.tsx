import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Input } from "../ui";
import { CategoryPicker } from "./category-picker";
import { MoneyItemTypeChips } from "./money-item-type-chips";

export type SplitPartDraft = { amount: string; category: string | null; item_type: MoneyItemType };

export function SplitTxnEditor({
  totalAmount,
  categories,
  onSave,
}: {
  totalAmount: number;
  categories: string[];
  onSave: (parts: Array<{ amount: number; category: string | null; expense_type: string | null; kind: string }>) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<SplitPartDraft[]>([
    { amount: String(Math.round(totalAmount / 2)), category: null, item_type: "variable" },
    { amount: String(totalAmount - Math.round(totalAmount / 2)), category: null, item_type: "variable" },
  ]);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={{ marginTop: 8 }}>
        <Text style={{ color: c.accent, fontWeight: "600", textAlign: textStart, writingDirection }}>{t("finance.splitTxn")}</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ marginTop: 10, padding: 10, borderWidth: 1, borderColor: c.border, borderRadius: tokens.radiusSm }}>
      <Text style={{ color: c.ink, fontWeight: "700", marginBottom: 8, textAlign: textStart, writingDirection }}>{t("finance.splitTxn")}</Text>
      {parts.map((p, i) => (
        <View key={i} style={{ marginBottom: 10 }}>
          <Input value={p.amount} onChangeText={(v) => setParts((prev) => prev.map((x, j) => (j === i ? { ...x, amount: v } : x)))} keyboardType="decimal-pad" />
          <View style={{ marginTop: 6 }}>
            <CategoryPicker categories={categories} value={p.category} onChange={(cat) => setParts((prev) => prev.map((x, j) => (j === i ? { ...x, category: cat } : x)))} allowEmpty />
          </View>
          <MoneyItemTypeChips value={p.item_type} onChange={(item_type) => setParts((prev) => prev.map((x, j) => (j === i ? { ...x, item_type } : x)))} />
        </View>
      ))}
      <Btn
        label={t("finance.addSplitPart")}
        variant="ghost"
        onPress={() => setParts((prev) => [...prev, { amount: "0", category: null, item_type: "variable" }])}
      />
      <View style={{ marginTop: 8, gap: 8 }}>
        <Btn
          label={saving ? t("common.saving") : t("common.save")}
          disabled={saving}
          onPress={async () => {
            setSaving(true);
            try {
              const mapped = parts.map((p) => ({
                amount: Number(p.amount),
                category: p.category,
                expense_type: p.item_type === "fixed" ? "fixed" : p.item_type === "variable" ? "variable" : null,
                kind: p.item_type === "income" ? "income" : "expense",
              }));
              const ok = await onSave(mapped);
              if (ok) setOpen(false);
            } finally {
              setSaving(false);
            }
          }}
        />
      </View>
    </View>
  );
}
