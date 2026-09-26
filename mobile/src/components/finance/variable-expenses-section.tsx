import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fmtAmount0, fmtAmount2 } from "@/lib/finance/format";
import { formatMerchantLabel } from "@/lib/finance/merchant-rules-client";
import type { VariableCategoryGroup } from "@/lib/finance/variable-breakdown";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Card, Row, SectionTitle, Skeleton } from "../ui";
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
    expense_type?: "fixed" | "variable" | "savings" | null;
    remember_rule?: boolean;
    is_internal?: boolean;
  }) => Promise<boolean>;
  onDeleteTxn: (id: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
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
      <Pressable onPress={onToggleSection} accessibilityRole="button">
        <Row>
          <SectionTitle>{t("finance.sectionVariable")}</SectionTitle>
          <Ionicons name={sectionCollapsed ? "chevron-down" : "chevron-up"} size={18} color={c.muted} />
        </Row>
      </Pressable>
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
                      <Text style={{ color: c.ink, fontWeight: "700", flex: 1, textAlign: textStart, writingDirection }}>
                        {group.category}
                      </Text>
                      <Text style={{ color: c.muted, fontSize: tokens.textXs, fontWeight: "600" }}>₪{fmtAmount0(group.total)}</Text>
                      <Ionicons name={catCollapsed ? "chevron-down" : "chevron-up"} size={16} color={c.muted} />
                    </Row>
                  </Pressable>
                  {!catCollapsed
                    ? group.transactions.map((txn) => {
                        const label = formatMerchantLabel(txn.merchant || txn.description);
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
                              <Text style={{ color: c.ink, fontWeight: "800", fontVariant: ["tabular-nums"] }}>−₪{fmtAmount2(txn.amount)}</Text>
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
        />
      ) : null}
    </View>
  );
}
