import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { MoneyItemType } from "@/lib/finance/money-item-type";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Input } from "../ui";
import { MoneyItemTypeChips } from "./money-item-type-chips";

export function CategoryManageModal({
  visible,
  categories,
  onClose,
  onRename,
  onUpdate,
}: {
  visible: boolean;
  categories: string[];
  onClose: () => void;
  onRename: (from: string, to: string) => Promise<boolean>;
  onUpdate: (name: string, default_type: MoneyItemType | null, weekly_budget: number | null) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [selected, setSelected] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [defaultType, setDefaultType] = useState<MoneyItemType>("variable");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 }} onPress={busy ? undefined : onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: c.bg, borderRadius: tokens.radiusSm, padding: 18, borderWidth: 1, borderColor: c.border, maxHeight: "90%" }}>
          <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, marginBottom: 10, textAlign: textStart, writingDirection }}>
            {t("finance.manageCategories")}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled">
            {categories.map((cat) => (
              <Pressable key={cat} onPress={() => { setSelected(cat); setRenameTo(cat); }} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <Text style={{ color: selected === cat ? c.accent : c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{cat}</Text>
              </Pressable>
            ))}
            {selected ? (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.renameCategory")}</Text>
                <Input value={renameTo} onChangeText={setRenameTo} editable={!busy} />
                <View style={{ marginTop: 10 }}>
                  <MoneyItemTypeChips value={defaultType} onChange={setDefaultType} />
                </View>
                <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.categoryWeeklyBudget")}</Text>
                <Input value={budget} onChangeText={setBudget} keyboardType="decimal-pad" editable={!busy} />
                <View style={{ marginTop: 12, gap: 8 }}>
                  <Btn
                    label={busy ? t("common.saving") : t("common.save")}
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        if (renameTo.trim() && renameTo !== selected) await onRename(selected, renameTo.trim());
                        await onUpdate(renameTo.trim() || selected, defaultType, budget.trim() ? Number(budget) : null);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
