import React, { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { fmtIls0 } from "@/lib/finance/format";
import { localeTag } from "@/lib/i18n/core";
import type { FinanceTransaction } from "@/lib/finance/types";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { useApiMutation, useApiQuery, queryKeys, queryClient } from "../src/query";
import { useToast } from "../src/toast";
import { BulkEditBar } from "../src/components/finance/bulk-edit-bar";
import { FinanceTxnRow } from "../src/components/finance/txn-row";
import { VariableTxnEditModal } from "../src/components/finance/variable-txn-edit-modal";
import { Card, EmptyState, ErrorNote, Screen } from "../src/components/ui";
import type { MoneyItemType } from "@/lib/finance/money-item-type";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export default function FinanceIncomeScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const params = useLocalSearchParams<{ month?: string }>();
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : monthKey();
  const loc = localeTag(locale);
  const { run } = useApiMutation();
  const { show: showToast } = useToast();

  const [editId, setEditId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

  const { data: txns, loading, error, refresh } = useApiQuery(
    queryKeys.financeTransactions(month),
    (cfg) => api.financeTransactions(cfg, { month, limit: 500 })
  );
  const { data: categoriesPayload } = useApiQuery(
    queryKeys.financeCategories,
    (cfg) => api.financeCategories(cfg),
    { staleTime: 300_000 }
  );

  const monthTxns = useMemo(
    () => (Array.isArray(txns) ? txns : (txns?.items ?? [])) as FinanceTransaction[],
    [txns]
  );
  const incomeTxns = useMemo(
    () =>
      monthTxns
        .filter((t) => t.kind === "income")
        .sort((a, b) => b.txn_date.localeCompare(a.txn_date) || (b.txn_time ?? "").localeCompare(a.txn_time ?? "")),
    [monthTxns]
  );
  const total = useMemo(() => incomeTxns.reduce((s, t) => s + t.amount, 0), [incomeTxns]);
  const categories = categoriesPayload?.categories ?? [];
  const editTxn = editId ? incomeTxns.find((t) => t.id === editId) ?? null : null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.financeTransactions(month) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };

  const saveTxn = async (
    id: string,
    patch: {
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
    }
  ): Promise<boolean> => {
    const result = await run((cfg) => api.patchFinanceTransaction(cfg, id, patch), { onSuccess: invalidate });
    return result != null;
  };

  const deleteTxn = async (id: string): Promise<boolean> => {
    const result = await run((cfg) => api.deleteFinanceTransaction(cfg, id), {
      onSuccess: () => {
        invalidate();
        setPendingRestoreId(id);
        showToast(t("finance.deletedUndo"));
        setTimeout(() => setPendingRestoreId((cur) => (cur === id ? null : cur)), 5000);
      },
    });
    return result != null;
  };

  const restoreTxn = async () => {
    if (!pendingRestoreId) return;
    await run((cfg) => api.restoreFinanceTransaction(cfg, pendingRestoreId), {
      onSuccess: () => {
        invalidate();
        setPendingRestoreId(null);
        showToast(t("finance.restored"));
      },
    });
  };

  const bulkApply = async (patch: { category?: string | null; item_type?: MoneyItemType }): Promise<boolean> => {
    if (!selectedIds.length) return false;
    const result = await run((cfg) => api.bulkFinanceTransactions(cfg, { ids: selectedIds, ...patch }), {
      onSuccess: () => {
        invalidate();
        setSelectedIds([]);
        setSelectionMode(false);
      },
    });
    return result != null;
  };

  const bulkDelete = async (): Promise<boolean> => {
    if (!selectedIds.length) return false;
    const result = await run((cfg) => api.bulkFinanceTransactions(cfg, { ids: selectedIds, delete: true }), {
      onSuccess: () => {
        invalidate();
        setSelectedIds([]);
        setSelectionMode(false);
      },
    });
    return result != null;
  };

  const renderRow = useCallback(
    (txn: FinanceTransaction) => (
      <FinanceTxnRow
        txn={txn}
        onPress={() => setEditId(txn.id)}
        selectionMode={selectionMode}
        selected={selectedIds.includes(txn.id)}
        onToggleSelect={() =>
          setSelectedIds((prev) => (prev.includes(txn.id) ? prev.filter((x) => x !== txn.id) : [...prev, txn.id]))
        }
      />
    ),
    [selectionMode, selectedIds]
  );

  return (
    <Screen title={t("finance.incomeBreakdownTitle")} subtitle={month} refreshing={loading} onRefresh={refresh}>
      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
          {t("finance.incomeBreakdownTotal")}
        </Text>
        <Text
          style={{
            color: c.good,
            fontWeight: "800",
            fontSize: 28,
            marginTop: 4,
            textAlign: textStart,
            writingDirection: "ltr",
          }}
        >
          {fmtIls0(total, loc)}
        </Text>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 6, textAlign: textStart, writingDirection }}>
          {t("finance.incomeBreakdownCount", { count: incomeTxns.length })}
        </Text>
      </Card>

      <BulkEditBar
        selectedCount={selectedIds.length}
        categories={categories}
        onCancel={() => {
          setSelectedIds([]);
          setSelectionMode(false);
        }}
        onApply={bulkApply}
        onDelete={bulkDelete}
      />

      {pendingRestoreId ? (
        <Text
          onPress={() => void restoreTxn()}
          style={{ color: c.accent, fontWeight: "600", marginBottom: 8, textAlign: textStart, writingDirection }}
        >
          {t("finance.tapToUndo")}
        </Text>
      ) : null}

      {!loading && incomeTxns.length === 0 ? (
        <EmptyState text={t("finance.incomeBreakdownEmpty")} />
      ) : (
        incomeTxns.map((txn) => (
          <View key={txn.id}>{renderRow(txn)}</View>
        ))
      )}

      {editTxn ? (
        <VariableTxnEditModal
          visible
          txn={{
            ...editTxn,
            category: editTxn.category,
            purpose_note: editTxn.purpose_note,
          }}
          categories={categories}
          onClose={() => setEditId(null)}
          onSave={(patch) =>
            saveTxn(editTxn.id, patch).then((ok) => {
              if (ok) setEditId(null);
              return ok;
            })
          }
          onDelete={() =>
            deleteTxn(editTxn.id).then((ok) => {
              if (ok) setEditId(null);
              return ok;
            })
          }
        />
      ) : null}
    </Screen>
  );
}
