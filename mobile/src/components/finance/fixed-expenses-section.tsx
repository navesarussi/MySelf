import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { FixedExpenseItem } from "@/lib/finance/fixed-expenses";
import { partitionFixedExpenses } from "@/lib/finance/fixed-expense-dormant";
import { fmtAmount0, fmtIls0 } from "@/lib/finance/format";
import { localeTag } from "@/lib/i18n/core";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, ErrorNote, Row, Skeleton } from "../ui";
import { CollapsibleSectionHeader } from "./collapsible-section-header";
import { FixedExpenseEditModal } from "./fixed-expense-edit-modal";
import { MoneyItemRow } from "./money-item-row";

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

function fixedSubtitle(
  t: (k: string, params?: Record<string, string | number>) => string,
  item: FixedExpenseItem
): string | null {
  const parts: string[] = [];
  if (item.charge_day) parts.push(t("finance.fixedDay", { day: String(item.charge_day) }));
  if (item.last_charge_date && item.last_charge_amount != null && item.last_charge_amount > 0) {
    parts.push(
      t("finance.fixedLastCharge", {
        date: item.last_charge_date,
        amount: fmtAmount0(item.last_charge_amount),
      })
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

function fixedStatus(item: FixedExpenseItem, t: (k: string) => string): { label: string; tone: "good" | "warn" | "muted" } | null {
  if (!item.is_active) return { label: t("finance.fixedPaused"), tone: "muted" };
  if (item.actual_amount <= 0 && item.planned_amount > 0) {
    return { label: t("finance.fixedPending"), tone: "warn" };
  }
  if (item.actual_amount >= item.planned_amount && item.planned_amount > 0) {
    return { label: t("finance.fixedPaid"), tone: "good" };
  }
  return null;
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
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const loc = localeTag(locale);
  const [editItem, setEditItem] = useState<FixedExpenseItem | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDormant, setShowDormant] = useState(false);

  const { active, dormant } = useMemo(() => partitionFixedExpenses(items), [items]);
  const visibleItems = showDormant ? [...active, ...dormant] : active;

  const plannedTotal = active.reduce((s, i) => s + (i.is_active ? i.planned_amount : 0), 0);
  const actualTotal = active.reduce((s, i) => s + i.actual_amount, 0);

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
      <CollapsibleSectionHeader
        title={t("finance.sectionFixed")}
        collapsed={collapsed}
        onPress={onToggleCollapse}
      />
      <Card>
        <Row style={{ marginBottom: 8 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, flex: 1, minWidth: 0, textAlign: textStart, writingDirection }}>
            {t("finance.planned")}: {fmtIls0(plannedTotal, loc)}
          </Text>
          <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "600", flexShrink: 0, writingDirection: "ltr" }}>
            {t("finance.actual")}: {fmtIls0(actualTotal, loc)}
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
            ) : visibleItems.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
                {t("finance.noFixedExpenses")}
              </Text>
            ) : (
              visibleItems.map((item) => {
                const status = fixedStatus(item, t);
                return (
                  <MoneyItemRow
                    key={item.id}
                    title={item.name}
                    category={item.category}
                    subtitle={[freqShort(t, item), fixedSubtitle(t, item)].filter(Boolean).join(" · ") || null}
                    planned={item.planned_amount}
                    actual={item.actual_amount}
                    muted={!item.is_active}
                    statusLabel={status?.label ?? null}
                    statusTone={status?.tone}
                    onPress={() => setEditItem(item)}
                  />
                );
              })
            )}
            {dormant.length > 0 && !showDormant ? (
              <Pressable onPress={() => setShowDormant(true)} style={{ paddingVertical: 8 }}>
                <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
                  {t("finance.fixedDormantHidden", { count: dormant.length })}
                </Text>
              </Pressable>
            ) : null}
            {showDormant && dormant.length > 0 ? (
              <Pressable onPress={() => setShowDormant(false)} style={{ paddingVertical: 4 }}>
                <Text style={{ color: c.accent, fontSize: tokens.textXs, fontWeight: "600", textAlign: textStart, writingDirection }}>
                  {t("finance.fixedHideDormant")}
                </Text>
              </Pressable>
            ) : null}
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
