import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FixedExpenseItem } from "@/lib/finance/fixed-expenses";
import { fmtAmount0 } from "@/lib/finance/format";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, ErrorNote, Row, SectionTitle, Skeleton } from "../ui";
import { FixedExpenseEditModal } from "./fixed-expense-edit-modal";

export type FixedExpensePatch = {
  name: string;
  planned_amount: number;
  category: string | null;
  frequency: FixedExpenseItem["frequency"];
  charge_day: number | null;
  default_note: string | null;
  is_active: boolean;
  merchant_key?: string;
};

function freqShort(t: (k: string, params?: Record<string, string | number>) => string, item: FixedExpenseItem): string {
  const base = t(`finance.fixedFrequency_${item.frequency}`);
  return item.charge_day ? `${base} · ${t("finance.fixedDay", { day: String(item.charge_day) })}` : base;
}

export function FixedExpensesSection({
  items,
  loading,
  error,
  categories,
  collapsed,
  onToggleCollapse,
  onRetry,
  onSave,
  onDelete,
  onAdd,
  onConvertToVariable,
  onUnlinkTxn,
}: {
  items: FixedExpenseItem[];
  loading?: boolean;
  error?: string | null;
  categories: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRetry?: () => void;
  onSave: (item: FixedExpenseItem, patch: FixedExpensePatch) => Promise<boolean>;
  onDelete: (item: FixedExpenseItem) => Promise<boolean>;
  onAdd: (patch: FixedExpensePatch) => Promise<boolean>;
  onConvertToVariable?: (item: FixedExpenseItem) => Promise<boolean>;
  onUnlinkTxn?: (item: FixedExpenseItem, txnId: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const [editItem, setEditItem] = useState<FixedExpenseItem | "new" | null>(null);
  const [saving, setSaving] = useState(false);

  const plannedTotal = items.reduce((s, i) => s + (i.is_active ? i.planned_amount : 0), 0);
  const actualTotal = items.reduce((s, i) => s + i.actual_amount, 0);

  async function handleSave(patch: FixedExpensePatch) {
    setSaving(true);
    try {
      const ok =
        editItem === "new"
          ? await onAdd(patch)
          : editItem
            ? await onSave(editItem, patch)
            : false;
      if (ok) setEditItem(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ marginBottom: 8 }}>
      <Pressable onPress={onToggleCollapse} accessibilityRole="button">
        <Row>
          <SectionTitle>{t("finance.sectionFixed")}</SectionTitle>
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={18} color={c.muted} />
        </Row>
      </Pressable>
      <Card>
        <Row style={{ marginBottom: 8 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, flex: 1, textAlign: textStart, writingDirection }}>
            {t("finance.planned")}: ₪{fmtAmount0(plannedTotal)}
          </Text>
          <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600" }}>
            {t("finance.actual")}: ₪{fmtAmount0(actualTotal)}
          </Text>
        </Row>
        {error ? <ErrorNote message={error} onRetry={onRetry} /> : null}
        {!collapsed ? (
          <>
            {loading && items.length === 0 ? (
              <>
                <Skeleton height={14} style={{ marginBottom: 8 }} />
                <Skeleton height={14} />
              </>
            ) : items.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
                {t("finance.noFixedExpenses")}
              </Text>
            ) : (
              items.map((item) => (
                <Pressable key={item.id} onPress={() => setEditItem(item)} style={{ marginBottom: 10 }}>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: item.is_active ? c.ink : c.muted, fontWeight: "600", textAlign: textStart, writingDirection }}>
                        {item.name}
                        {!item.is_active ? ` · ${t("finance.fixedPaused")}` : ""}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 2, textAlign: textStart, writingDirection }}>
                        {[item.category, freqShort(t, item), item.last_charge_date ? t("finance.fixedLastCharge", { date: item.last_charge_date, amount: fmtAmount0(item.last_charge_amount ?? 0) }) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: c.muted, fontSize: tokens.textXs }}>{t("finance.planned")} ₪{fmtAmount0(item.planned_amount)}</Text>
                      <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600" }}>{t("finance.actual")} ₪{fmtAmount0(item.actual_amount)}</Text>
                    </View>
                  </Row>
                </Pressable>
              ))
            )}
            <Pressable onPress={() => setEditItem("new")} style={{ marginTop: 4 }}>
              <Text style={{ color: c.accent, fontWeight: "600", textAlign: textStart, writingDirection }}>
                + {t("finance.addFixedExpense")}
              </Text>
            </Pressable>
          </>
        ) : null}
      </Card>
      {editItem ? (
        <FixedExpenseEditModal
          visible
          item={
            editItem === "new"
              ? {
                  id: "new",
                  rule_id: null,
                  merchant_key: "",
                  name: "",
                  category: null,
                  planned_amount: 0,
                  actual_amount: 0,
                  frequency: "monthly",
                  charge_day: null,
                  last_charge_date: null,
                  last_charge_amount: null,
                  default_note: null,
                  is_active: true,
                }
              : editItem
          }
          categories={categories}
          saving={saving}
          onClose={() => !saving && setEditItem(null)}
          onSave={handleSave}
          onDelete={
            editItem !== "new" && editItem.rule_id
              ? async () => {
                  setSaving(true);
                  try {
                    const ok = await onDelete(editItem);
                    if (ok) setEditItem(null);
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
          onConvertToVariable={
            editItem !== "new" && editItem.rule_id && onConvertToVariable
              ? async () => {
                  setSaving(true);
                  try {
                    const ok = await onConvertToVariable(editItem);
                    if (ok) setEditItem(null);
                  } finally {
                    setSaving(false);
                  }
                }
              : undefined
          }
          onUnlinkTxn={
            editItem !== "new" && onUnlinkTxn
              ? async (txnId) => { await onUnlinkTxn(editItem, txnId); }
              : undefined
          }
        />
      ) : null}
    </View>
  );
}
