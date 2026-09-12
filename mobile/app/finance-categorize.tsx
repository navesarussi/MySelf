import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { api } from "../src/api/resources";
import { useSession } from "../src/session";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation, decFinanceUncategorizedInHome } from "../src/query";
import type { HomePayload } from "../src/api/resources";
import { Btn, Card, Chip, ErrorNote, Input, Loading, Screen } from "../src/components/ui";
import type { FinanceTransaction } from "@/lib/finance/types";

export default function FinanceCategorizeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const { token, serverUrl } = useSession();
  const { run, isPending } = useApiMutation();
  const [txn, setTxn] = useState<(FinanceTransaction & { suggested_category?: string | null }) | null>(
    null
  );
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    api
      .financeTransaction({ token, serverUrl }, id)
      .then((row) => {
        setTxn(row);
        if (row.suggested_category) setCategory(row.suggested_category);
        if (row.purpose_note) setNote(row.purpose_note);
      })
      .catch(() => setError("load_failed"));
  }, [token, serverUrl, id]);

  async function save(skip = false) {
    if (!token || !id) return;
    setError(null);
    const month = txn?.txn_date.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
    const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
    queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
      decFinanceUncategorizedInHome(old)
    );
    await run(
      (cfg) =>
        api.categorizeFinanceTransaction(
          cfg,
          id,
          skip ? { skip: true } : { category: category!, purpose_note: note || null }
        ),
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.financeCashflow(month) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.financeTransactions(month) });
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

  return (
    <Screen title={t("finance.categorizeTitle")} subtitle={label}>
      {error ? <ErrorNote message={error} /> : null}
      {txn ? (
        <Card>
          <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, textAlign: textStart, writingDirection }}>
            {txn.kind === "income" ? "+" : "−"}₪{txn.amount.toFixed(2)}
          </Text>
          <Text style={{ color: c.muted, marginTop: 4, textAlign: textStart, writingDirection }}>{txn.txn_date}</Text>
          {txn.suggested_category && !txn.category ? (
            <Text style={{ color: c.accent, marginTop: 8, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {t("finance.suggestedCategory", { category: txn.suggested_category })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 12 }}>
        {FINANCE_CATEGORIES.map((cat) => (
          <Chip key={cat} label={cat} active={category === cat} onPress={() => setCategory(cat)} />
        ))}
      </View>

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
