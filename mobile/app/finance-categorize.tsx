import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { fmtAmount2 } from "@/lib/finance/format";
import { api } from "../src/api/resources";
import { useSession } from "../src/session";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation } from "../src/query";
import { Btn, Card, ErrorNote, Input, Loading, Screen } from "../src/components/ui";
import { ExpenseTypeChips, RememberRuleToggle, type ExpenseTypeValue } from "../src/components/finance/categorize-controls";
import { CategoryPicker } from "../src/components/finance/category-picker";
import { QuickCategoryChips } from "../src/components/finance/quick-category-chips";
import {
  nextUncategorizedId,
  saveCategorization,
  type UncategorizedTxn,
} from "../src/components/finance/categorize-save";
import { TxnDateTimeFields } from "../src/components/finance/txn-datetime-fields";
import { expenseTypeForCategory } from "@/lib/finance/suggest-txn";

export default function FinanceCategorizeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const { token, serverUrl } = useSession();
  const { run, isPending } = useApiMutation();
  const [txn, setTxn] = useState<UncategorizedTxn | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseTypeValue>("variable");
  const [rememberRule, setRememberRule] = useState(true);
  const [note, setNote] = useState("");
  const [txnDate, setTxnDate] = useState("");
  const [txnTime, setTxnTime] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queue = queryClient.getQueryData<UncategorizedTxn[]>(queryKeys.financeUncategorized) ?? [];
  const queueIndex = useMemo(() => queue.findIndex((row) => row.id === id), [queue, id]);
  const queueLabel =
    queue.length > 1 && queueIndex >= 0
      ? t("finance.categorizeQueue", { current: queueIndex + 1, total: queue.length })
      : null;

  const loadTxn = useCallback(() => {
    if (!token || !id) return;
    Promise.all([api.financeTransaction({ token, serverUrl }, id), api.financeCategories({ token, serverUrl })])
      .then(([row, cats]) => {
        const detail = row as UncategorizedTxn;
        setTxn(detail);
        setCategories(cats.categories);
        const cat = detail.category || detail.suggested_category;
        if (cat) setCategory(cat);
        if (detail.purpose_note || detail.default_note) setNote(detail.purpose_note || detail.default_note || "");
        setTxnDate(detail.txn_date);
        setTxnTime(detail.txn_time ?? "");
        if (detail.expense_type) setExpenseType(detail.expense_type);
        else if (detail.suggested_expense_type) setExpenseType(detail.suggested_expense_type);
        else if (cat) {
          const resolved = expenseTypeForCategory(cat, detail.kind);
          if (resolved) setExpenseType(resolved);
        }
      })
      .catch(() => setError("load_failed"));
  }, [token, serverUrl, id]);

  useEffect(() => {
    loadTxn();
  }, [loadTxn]);

  const advance = useCallback(() => {
    if (!id) {
      router.back();
      return;
    }
    const nextId = nextUncategorizedId(id);
    if (nextId) {
      router.replace(`/finance-categorize?id=${nextId}` as `/${string}`);
      return;
    }
    router.back();
  }, [id, router]);

  const submitCategory = useCallback(
    async (cat: string, opts?: { rememberRule?: boolean }) => {
      if (!token || !serverUrl || !txn) return;
      setError(null);
      const payload: UncategorizedTxn = {
        ...txn,
        purpose_note: note || txn.default_note || txn.purpose_note,
        suggested_expense_type:
          txn.kind === "expense" ? expenseTypeForCategory(cat, txn.kind, expenseType) : null,
      };
      await run(
        (cfg) => saveCategorization(cfg, payload, cat, { rememberRule: opts?.rememberRule ?? rememberRule }),
        {
          onSuccess: () => advance(),
          onError: () => setError("save_failed"),
        }
      );
    },
    [token, serverUrl, txn, note, expenseType, rememberRule, run, advance]
  );

  async function save(skip = false) {
    if (!token || !txn || !id) return;
    if (skip) {
      await run((cfg) => saveCategorization(cfg, txn, "", { skip: true }), {
        onSuccess: () => advance(),
        onError: () => setError("save_failed"),
      });
      return;
    }
    if (!category) return;
    await submitCategory(category);
  }

  if (!id) {
    return (
      <Screen title={t("finance.categorizeTitle")}>
        <ErrorNote message="missing_id" />
      </Screen>
    );
  }

  if (!txn && !error) return <Loading />;

  const label = txn?.merchant || txn?.description || "";
  const busy = isPending();
  const isExpense = txn?.kind === "expense";
  const suggested = txn?.suggested_category ?? null;

  return (
    <Screen
      title={t(isExpense ? "finance.categorizeTitle" : "finance.categorizeTitleIncome")}
      subtitle={queueLabel ?? label}
    >
      {error ? <ErrorNote message={error} /> : null}
      {txn ? (
        <Card>
          <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, textAlign: textStart, writingDirection }}>
            {txn.kind === "income" ? "+" : "−"}₪{fmtAmount2(txn.amount)}
          </Text>
          <Text style={{ color: c.muted, marginTop: 4, textAlign: textStart, writingDirection }} numberOfLines={2}>
            {label}
          </Text>
        </Card>
      ) : null}

      {suggested ? (
        <View style={{ marginTop: 14 }}>
          <Btn
            label={t("finance.confirmSuggestion", { category: suggested })}
            onPress={() => submitCategory(suggested)}
            disabled={busy}
          />
        </View>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <QuickCategoryChips
          categories={categories}
          suggested={suggested}
          selected={category}
          disabled={busy}
          onPick={(cat) => {
            setCategory(cat);
            void submitCategory(cat);
          }}
        />
      </View>

      <Pressable onPress={() => setShowDetails((v) => !v)} style={{ marginTop: 12, paddingVertical: 6 }}>
        <Text style={{ color: c.accent, fontWeight: "600", textAlign: textStart, writingDirection }}>
          {showDetails ? t("finance.hideDetails") : t("finance.showDetails")}
        </Text>
      </Pressable>

      {showDetails ? (
        <View style={{ marginTop: 8 }}>
          <TxnDateTimeFields txnDate={txnDate} txnTime={txnTime} onDateChange={setTxnDate} onTimeChange={setTxnTime} />
          <View style={{ marginTop: 14 }}>
            <CategoryPicker categories={categories} value={category} onChange={setCategory} />
          </View>
          {isExpense ? <ExpenseTypeChips value={expenseType} onChange={setExpenseType} /> : null}
          <RememberRuleToggle value={rememberRule} onToggle={() => setRememberRule((v) => !v)} />
          <Input value={note} onChangeText={setNote} placeholder={t("finance.purposePlaceholder")} multiline />
          <View style={{ marginTop: 12 }}>
            <Btn label={t("finance.saveCategory")} onPress={() => save(false)} disabled={!category || busy} />
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Btn label={t("finance.skip")} variant="ghost" onPress={() => save(true)} disabled={busy} />
      </View>
    </Screen>
  );
}
