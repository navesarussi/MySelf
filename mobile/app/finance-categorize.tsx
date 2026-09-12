import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { api } from "../src/api/resources";
import { useSession } from "../src/session";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { Btn, Card, Chip, ErrorNote, Input, Loading, Screen } from "../src/components/ui";
import type { FinanceTransaction } from "@/lib/finance/types";

export default function FinanceCategorizeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const { token, serverUrl } = useSession();
  const [txn, setTxn] = useState<FinanceTransaction | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    const month = new Date().toISOString().slice(0, 7);
    api
      .financeTransactions({ token, serverUrl }, { month, limit: 200 })
      .then((list) => setTxn(list.find((x) => x.id === id) ?? null))
      .catch(() => setError("load_failed"));
  }, [token, serverUrl, id]);

  async function save(skip = false) {
    if (!token || !id) return;
    setBusy(true);
    setError(null);
    try {
      await api.categorizeFinanceTransaction(
        { token, serverUrl },
        id,
        skip ? { skip: true } : { category: category!, purpose_note: note || null }
      );
      router.back();
    } catch {
      setError("save_failed");
    } finally {
      setBusy(false);
    }
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

  return (
    <Screen title={t("finance.categorizeTitle")} subtitle={label}>
      {error ? <ErrorNote message={error} /> : null}
      {txn ? (
        <Card>
          <Text style={{ color: c.ink, fontWeight: "700", fontSize: tokens.title, textAlign: textStart, writingDirection }}>
            {txn.kind === "income" ? "+" : "−"}₪{txn.amount.toFixed(2)}
          </Text>
          <Text style={{ color: c.muted, marginTop: 4, textAlign: textStart, writingDirection }}>{txn.txn_date}</Text>
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
