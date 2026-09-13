import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { lineTypeForCategory } from "@/lib/finance/expense-type";
import { api } from "../src/api/resources";
import { useSession } from "../src/session";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation, decFinanceUncategorizedInHome } from "../src/query";
import type { HomePayload } from "../src/api/resources";
import { Btn, Card, ErrorNote, Input, Loading, Screen } from "../src/components/ui";
import {
  ExpenseTypeChips,
  RememberRuleToggle,
  type ExpenseTypeValue,
} from "../src/components/finance/categorize-controls";
import { CategoryPicker } from "../src/components/finance/category-picker";
import { TxnDateTimeFields } from "../src/components/finance/txn-datetime-fields";
import type { FinanceTransaction } from "@/lib/finance/types";

type TxnDetail = FinanceTransaction & {
  suggested_category?: string | null;
  suggested_expense_type?: ExpenseTypeValue | null;
  default_note?: string | null;
};

export default function FinanceCategorizeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const { token, serverUrl } = useSession();
  const { run, isPending } = useApiMutation();
  const [txn, setTxn] = useState<TxnDetail | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseTypeValue>("variable");
  const [rememberRule, setRememberRule] = useState<boolean>(true);
  const [note, setNote] = useState("");
  const [txnDate, setTxnDate] = useState("");
  const [txnTime, setTxnTime] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      api.financeTransaction({ token, serverUrl }, id),
      api.financeCategories({ token, serverUrl }),
    ])
      .then(([row, cats]) => {
        setTxn(row);
        setCategories(cats.categories);
        const cat = row.category || row.suggested_category;
        if (cat) setCategory(cat);
        if (row.purpose_note || row.default_note) setNote(row.purpose_note || row.default_note || "");
        setTxnDate(row.txn_date);
        setTxnTime(row.txn_time ?? "");
        if (row.expense_type) {
          setExpenseType(row.expense_type);
        } else if (row.suggested_expense_type) {
          setExpenseType(row.suggested_expense_type);
        } else if (cat) {
          const resolved = lineTypeForCategory(cat, "expense");
          if (resolved === "fixed" || resolved === "variable" || resolved === "savings") {
            setExpenseType(resolved);
          }
        }
      })
      .catch(() => setError("load_failed"));
  }, [token, serverUrl, id]);

  const onSelectCategory = (cat: string | null) => {
    if (!cat) return;
    setCategory(cat);
    if (!txn?.expense_type) {
      const resolved = lineTypeForCategory(cat, "expense");
      if (resolved === "fixed" || resolved === "variable" || resolved === "savings") {
        setExpenseType(resolved);
      }
    }
  };

  async function save(skip = false) {
    if (!token || !id) return;
    setError(null);
    const month = txnDate.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
    const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
    queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => decFinanceUncategorizedInHome(old));
    await run(
      (cfg) =>
        api.categorizeFinanceTransaction(
          cfg,
          id,
          skip
            ? { skip: true }
            : {
                category: category!,
                purpose_note: note || null,
                expense_type: txn?.kind === "expense" ? expenseType : null,
                remember_rule: rememberRule,
                txn_date: txnDate,
                txn_time: txnTime.trim() || null,
              }
        ),
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.financeCashflow(month) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.financeTransactions(month) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
          router.back();
        },
        onError: () => {
          if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
          setError("save_failed");
        },
      }
    );
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

  return (
    <Screen
      title={t(isExpense ? "finance.categorizeTitle" : "finance.categorizeTitleIncome")}
      subtitle={label}
    >
      {error ? <ErrorNote message={error} /> : null}
      {txn ? (
        <Card>
          <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, textAlign: textStart, writingDirection }}>
            {txn.kind === "income" ? "+" : "−"}₪{txn.amount.toFixed(2)}
          </Text>
          {txn.suggested_category && !txn.category ? (
            <Text style={{ color: c.accent, marginTop: 8, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {t("finance.suggestedCategory", { category: txn.suggested_category })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <TxnDateTimeFields
          txnDate={txnDate}
          txnTime={txnTime}
          onDateChange={setTxnDate}
          onTimeChange={setTxnTime}
        />
      </View>

      <View style={{ marginTop: 14 }}>
        <CategoryPicker categories={categories} value={category} onChange={onSelectCategory} />
      </View>

      {isExpense ? <ExpenseTypeChips value={expenseType} onChange={setExpenseType} /> : null}

      <RememberRuleToggle value={rememberRule} onToggle={() => setRememberRule((v) => !v)} />

      <Input
        value={note}
        onChangeText={setNote}
        placeholder={t("finance.purposePlaceholder")}
        multiline
      />

      <View style={{ marginTop: 16, gap: 8 }}>
        <Btn label={t("finance.saveCategory")} onPress={() => save(false)} disabled={!category || busy} />
        <Btn label={t("finance.skip")} variant="ghost" onPress={() => save(true)} disabled={busy} />
      </View>
    </Screen>
  );
}
