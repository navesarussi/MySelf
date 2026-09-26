import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn } from "../ui";
import { CategoryPicker } from "./category-picker";
import { MoneyItemTypeChips } from "./money-item-type-chips";

export function BulkEditBar({
  selectedCount,
  categories,
  onCancel,
  onApply,
  onDelete,
}: {
  selectedCount: number;
  categories: string[];
  onCancel: () => void;
  onApply: (patch: { category?: string | null; item_type?: MoneyItemType }) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [itemType, setItemType] = useState<MoneyItemType>("variable");
  const [busy, setBusy] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <>
      <View style={{ ...row, gap: 8, paddingVertical: 8, paddingHorizontal: 4, backgroundColor: c.surface, borderRadius: tokens.radiusSm, marginBottom: 8 }}>
        <Text style={{ color: c.ink, flex: 1, fontWeight: "600", textAlign: textStart, writingDirection }}>
          {t("finance.bulkSelected", { count: selectedCount })}
        </Text>
        <Btn label={t("finance.bulkEdit")} onPress={() => setOpen(true)} />
        <Btn
          label={t("common.delete")}
          variant="ghost"
          onPress={async () => {
            setBusy(true);
            try {
              await onDelete();
            } finally {
              setBusy(false);
            }
          }}
        />
        <Btn label={t("common.cancel")} variant="ghost" onPress={onCancel} />
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 }} onPress={() => setOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: c.bg, borderRadius: tokens.radiusSm, padding: 18, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, marginBottom: 10, textAlign: textStart, writingDirection }}>
              {t("finance.bulkEdit")}
            </Text>
            <MoneyItemTypeChips value={itemType} onChange={setItemType} />
            <CategoryPicker categories={categories} value={category} onChange={setCategory} allowEmpty />
            <View style={{ marginTop: 16, gap: 8 }}>
              <Btn
                label={busy ? t("common.saving") : t("common.save")}
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    const ok = await onApply({ category, item_type: itemType });
                    if (ok) setOpen(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
