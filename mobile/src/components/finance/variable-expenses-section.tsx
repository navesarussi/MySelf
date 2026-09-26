import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fmtAmount0, fmtIls0, fmtIls2 } from "@/lib/finance/format";
import { txnMerchantDisplay } from "@/lib/finance/merchant-display";
import { localeTag } from "@/lib/i18n/core";
import type { VariableCategoryGroup } from "@/lib/finance/variable-breakdown";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, Row, Skeleton } from "../ui";
import { CollapsibleSectionHeader } from "./collapsible-section-header";
import { VariableTxnEditModal } from "./variable-txn-edit-modal";

export function VariableExpensesSection({
  groups,
  loading,
  sectionCollapsed,
  onToggleSection,
  isCategoryCollapsed,
  onToggleCategory,
  categories,
  onSaveTxn,
  onDeleteTxn,
  onSplitTxn,
}: {
  groups: VariableCategoryGroup[];
  loading?: boolean;
  sectionCollapsed: boolean;
  onToggleSection: () => void;
  isCategoryCollapsed: (category: string) => boolean;
  onToggleCategory: (category: string) => void;
  categories: string[];
  onSaveTxn: (id: string, patch: {
    category: string | null;
    purpose_note: string | null;
    amount?: number;
    merchant?: string | null;
    description?: string | null;
    txn_date?: string;
    txn_time?: string | null;
    item_type?: import("@/lib/finance/money-item-type").MoneyItemType;
    expense_type?: "fixed" | "variable" | "savings" | null;
    remember_rule?: boolean;
    apply_to_all?: boolean;
    is_internal?: boolean;
  }) => Promise<boolean>;
  onDeleteTxn: (id: string) => Promise<boolean>;
  onSplitTxn?: (id: string, parts: Array<{ amount: number; category: string | null; expense_type: string | null; kind: string }>) => Promise<boolean>;
}) {
  const { t, locale } = useI18n();
  const loc = localeTag(locale);
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const [editTxnId, setEditTxnId] = useState<string | null>(null);

  const totals = useMemo(
    () => groups.reduce((s, g) => s + g.total, 0),
    [groups]
  );

  const editTxn = editTxnId
    ? groups.flatMap((g) => g.transactions).find((t) => t.id === editTxnId) ?? null
    : null;

  return (
    <View style={{ marginBottom: 8 }}>
      <CollapsibleSectionHeader
        title={t("finance.sectionVariable")}
        collapsed={sectionCollapsed}
        onPress={onToggleSection}
      />
      <Card>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 8, textAlign: textStart, writingDirection }}>
          {t("finance.actual")}: ₪{fmtAmount0(totals)}
        </Text>
        {!sectionCollapsed ? (
          loading && groups.length === 0 ? (
            <>
              <Skeleton height={14} style={{ marginBottom: 8 }} />
              <Skeleton height={14} />
            </>
          ) : groups.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {t("finance.noVariableExpenses")}
            </Text>
          ) : (
            groups.map((group) => {
              const catCollapsed = isCategoryCollapsed(group.category);
              return (
                <View key={group.category} style={{ marginBottom: 8 }}>
                  <Pressable onPress={() => onToggleCategory(group.category)} accessibilityRole="button">
                    <Row style={{ marginBottom: 4 }}>
                      <Text style={{ color: c.ink, fontWeight: "700", flex: 1, minWidth: 0, textAlign: textStart, writingDirection }}>
                        {group.category}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600", flexShrink: 0, writingDirection: "ltr" }}>
                        {fmtIls0(group.total, loc)}
                      </Text>
                      <Ionicons name={catCollapsed ? "chevron-down" : "chevron-up"} size={16} color={c.muted} style={{ flexShrink: 0 }} />
                    </Row>
                  </Pressable>
                  {!catCollapsed
                    ? group.transactions.map((txn) => {
                        const label = txnMerchantDisplay(txn);
                        const when = txn.txn_time ? `${txn.txn_date} ${txn.txn_time}` : txn.txn_date;
                        return (
                          <Pressable key={txn.id} onPress={() => setEditTxnId(txn.id)} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
                            <Row>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: c.ink, fontWeight: "600", textAlign: textStart, writingDirection }}>{label}</Text>
                                <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 2, textAlign: textStart, writingDirection }}>
                                  {[when, txn.purpose_note].filter(Boolean).join(" · ")}
                                </Text>
                              </View>
                              <Text style={{ color: c.ink, fontWeight: "800", fontVariant: ["tabular-nums"], writingDirection: "ltr" }}>−{fmtIls2(txn.amount, loc)}</Text>
                            </Row>
                          </Pressable>
                        );
                      })
                    : null}
                </View>
              );
            })
          )
        ) : null}
      </Card>
      {editTxn ? (
        <VariableTxnEditModal
          visible
          txn={editTxn}
          categories={categories}
          onClose={() => setEditTxnId(null)}
          onSave={(patch) => onSaveTxn(editTxn.id, patch).then((ok) => {
            if (ok) setEditTxnId(null);
            return ok;
          })}
          onDelete={() => onDeleteTxn(editTxn.id).then((ok) => {
            if (ok) setEditTxnId(null);
            return ok;
          })}
          onSplit={onSplitTxn ? (parts) => onSplitTxn(editTxn.id, parts).then((ok) => {
            if (ok) setEditTxnId(null);
            return ok;
          }) : undefined}
        />
      ) : null}
    </View>
  );
}
