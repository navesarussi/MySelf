import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { lineTypeForCategory } from "@/lib/finance/expense-type";
import { fmtAmount2 } from "@/lib/finance/format";
import type { FinanceTransaction } from "@/lib/finance/types";
import { api, type HomePayload } from "../src/api/resources";
import { useSession } from "../src/session";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { useToast } from "../src/toast";
import { queryClient, queryKeys, useApiMutation, decFinanceUncategorizedInHome } from "../src/query";
import { Btn, Card, ErrorNote, Input, Loading, Screen } from "../src/components/ui";
import {
  ExpenseTypeChips,
  RememberRuleToggle,
  type ExpenseTypeValue,
} from "../src/components/finance/categorize-controls";
import { CategoryPicker } from "../src/components/finance/category-picker";
import { TxnDateTimeFields } from "../src/components/finance/txn-datetime-fields";

type TxnDetail = FinanceTransaction & {
  suggested_category?: string | null;
  suggested_expense_type?: ExpenseTypeValue | null;
  default_note?: string | null;
};

const SOURCE_KEYS: Record<string, string> = {
  leumi: "finance.sourceLeumi",
  apple_pay: "finance.sourceApplePay",
  max: "finance.sourceMax",
  visa_cal: "finance.sourceVisaCal",
  manual: "finance.sourceManual",
};

export default function FinanceTransactionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const c = useColors();
  const { show: showToast } = useToast();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const { token, serverUrl } = useSession();
  const { run, isPending } = useApiMutation();

  const [txn, setTxn] = useState<TxnDetail | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseTypeValue>("variable");
  const [rememberRule, setRememberRule] = useState(true);
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
        setCategory(row.category ?? null);
        setNote(row.purpose_note || row.default_note || "");
        setTxnDate(row.txn_date);
        setTxnTime(row.txn_time ?? "");
        if (row.expense_type) setExpenseType(row.expense_type);
        else if (row.suggested_expense_type) setExpenseType(row.suggested_expense_type);
        else if (row.category) {
          const res = lineTypeForCategory(row.category, "expense");
          if (res === "fixed" || res === "variable" || res === "savings") setExpenseType(res);
        }
      })
      .catch(() => setError("load_failed"));
  }, [token, serverUrl, id]);

  const onSelectCategory = (cat: string | null) => {
    setCategory(cat);
    if (!txn?.expense_type && cat) {
      const res = lineTypeForCategory(cat, "expense");
      if (res === "fixed" || res === "variable" || res === "savings") setExpenseType(res);
    }
  };

  async function save() {
    if (!token || !id) return;
    setError(null);
    const month = txnDate.slice(0, 7) || txn?.txn_date.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
    if (txn?.needs_categorization) {
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => decFinanceUncategorizedInHome(old));
    }

    await run(
      (cfg) =>
        api.patchFinanceTransaction(cfg, id, {
          category,
          purpose_note: note || null,
          expense_type: txn?.kind === "expense" ? expenseType : null,
          remember_rule: rememberRule,
          txn_date: txnDate,
          txn_time: txnTime.trim() || null,
        }),
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.financeCashflow(month) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.financeTransactions(month) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
          showToast(t("finance.updated"));
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
      <Screen title={t("finance.editTransaction")}>
        <ErrorNote message="missing_id" />
      </Screen>
    );
  }

  if (!txn && !error) return <Loading />;

  const label = txn?.merchant || txn?.description || "";
  const isExpense = txn?.kind === "expense";
  const busy = isPending();
  const sourceLabel = txn && SOURCE_KEYS[txn.source] ? t(SOURCE_KEYS[txn.source]) : txn?.source || "";
  const metaParts = [sourceLabel, txn?.card_name].filter(Boolean).join(" · ");

  return (
    <Screen title={t("finance.editTransaction")} subtitle={label}>
      {error ? <ErrorNote message={error} /> : null}
      {txn ? (
        <Card>
          <Text style={{ color: isExpense ? c.ink : c.good, fontWeight: "700", fontSize: tokens.title, textAlign: textStart, writingDirection }}>
            {isExpense ? "−" : "+"}₪{fmtAmount2(txn.amount)}
          </Text>
          {metaParts ? <Text style={{ color: c.muted, marginTop: 4, textAlign: textStart, writingDirection }}>{metaParts}</Text> : null}
          {txn.merchant && txn.description && txn.merchant !== txn.description ? (
            <Text style={{ color: c.muted, marginTop: 4, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{txn.description}</Text>
          ) : null}
        </Card>
      ) : null}

      <View style={{ marginTop: 14 }}>
        <TxnDateTimeFields txnDate={txnDate} txnTime={txnTime} onDateChange={setTxnDate} onTimeChange={setTxnTime} />
      </View>
      <CategoryPicker categories={categories} value={category} onChange={onSelectCategory} allowEmpty />
      {isExpense ? <View style={{ marginTop: 14 }}><ExpenseTypeChips value={expenseType} onChange={setExpenseType} /></View> : null}
      <View style={{ marginTop: 14 }}><RememberRuleToggle value={rememberRule} onToggle={() => setRememberRule((v) => !v)} /></View>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 6, textAlign: textStart, writingDirection }}>{t("finance.note")}</Text>
        <Input value={note} onChangeText={setNote} placeholder={t("finance.purposePlaceholder")} multiline />
      </View>
      <View style={{ marginTop: 8, gap: 8 }}>
        <Btn label={t("common.save")} onPress={save} disabled={busy} />
      </View>
    </Screen>
  );
}
