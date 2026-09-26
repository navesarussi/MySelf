import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import type { FixedExpenseItem } from "@/lib/finance/fixed-expenses";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Chip, Input, Row } from "../ui";
import { CategoryPicker } from "./category-picker";

const FREQUENCIES = ["monthly", "weekly", "yearly"] as const;

export function FixedExpenseEditModal({
  visible,
  item,
  categories,
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  item: FixedExpenseItem | null;
  categories: string[];
  saving?: boolean;
  onClose: () => void;
  onSave: (patch: {
    name: string;
    planned_amount: number;
    category: string | null;
    frequency: FixedExpenseItem["frequency"];
    charge_day: number | null;
    default_note: string | null;
    is_active: boolean;
    merchant_key?: string;
  }) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [category, setCategory] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<FixedExpenseItem["frequency"]>("monthly");
  const [chargeDay, setChargeDay] = useState("");
  const [note, setNote] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!visible || !item) return;
    setName(item.name);
    setAmount(String(item.planned_amount));
    setCategory(item.category);
    setFrequency(item.frequency);
    setChargeDay(item.charge_day != null ? String(item.charge_day) : "");
    setNote(item.default_note ?? "");
    setActive(item.is_active);
  }, [visible, item]);

  if (!visible || !item) return null;

  const freqLabel = (f: FixedExpenseItem["frequency"]) => t(`finance.fixedFrequency_${f}`);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 }} onPress={saving ? undefined : onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: c.bg, borderRadius: tokens.radiusSm, padding: 18, borderWidth: 1, borderColor: c.border, maxHeight: "90%" }}>
          <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, marginBottom: 10, textAlign: textStart, writingDirection }}>
            {t("finance.fixedExpenseEdit")}
          </Text>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.editMerchant")}</Text>
          <Input value={name} onChangeText={setName} editable={!saving} />
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.editPlanned")}</Text>
          <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!saving} />
          <View style={{ marginTop: 10 }}>
            <CategoryPicker categories={categories} value={category} onChange={setCategory} allowEmpty />
          </View>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.fixedFrequency")}</Text>
          <View style={{ ...row, gap: 8, flexWrap: "wrap" }}>
            {FREQUENCIES.map((f) => (
              <Chip key={f} label={freqLabel(f)} active={frequency === f} onPress={() => setFrequency(f)} />
            ))}
          </View>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.fixedChargeDay")}</Text>
          <Input value={chargeDay} onChangeText={setChargeDay} keyboardType="number-pad" placeholder="1-31" editable={!saving} />
          <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 10, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.note")}</Text>
          <Input value={note} onChangeText={setNote} multiline editable={!saving} />
          <Pressable onPress={() => setActive((v) => !v)} style={{ marginTop: 12 }}>
            <Text style={{ color: active ? c.good : c.warn, fontWeight: "600", textAlign: textStart, writingDirection }}>
              {active ? t("finance.fixedActive") : t("finance.fixedPaused")}
            </Text>
          </Pressable>
          <View style={{ marginTop: 16, gap: 8 }}>
            <Btn
              label={saving ? t("common.saving") : t("common.save")}
              disabled={saving}
              onPress={() => {
                const planned = Number(amount);
                const day = chargeDay.trim() ? Number(chargeDay) : null;
                if (!Number.isFinite(planned) || planned < 0) return;
                if (day != null && (!Number.isInteger(day) || day < 1 || day > 31)) return;
                void onSave({
                  name: name.trim(),
                  planned_amount: planned,
                  category,
                  frequency,
                  charge_day: day,
                  default_note: note.trim() || null,
                  is_active: active,
                  merchant_key: item.merchant_key,
                });
              }}
            />
            {onDelete && item.rule_id ? (
              <Btn label={t("common.delete")} variant="ghost" disabled={saving} onPress={() => void onDelete()} />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
