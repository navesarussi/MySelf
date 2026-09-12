import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import { useApiQuery, queryKeys } from "../../src/query";
import { Card, EmptyState, ErrorNote, Loading, Row, Screen, SectionTitle } from "../../src/components/ui";
import type { FinanceCashflow, FinanceTransaction } from "@/lib/finance/types";

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

function formatMonthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(locale === "he" ? "he-IL" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

function TxnRow({ txn, onPress }: { txn: FinanceTransaction; onPress: () => void }) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const sign = txn.kind === "income" ? "+" : "−";
  const label = txn.merchant || txn.description;
  return (
    <Pressable onPress={onPress}>
      <Card>
        <Row>
          <Text style={{ color: c.ink, fontWeight: "600", flex: 1, textAlign: textStart, writingDirection }}>
            {label}
          </Text>
          <Text style={{ color: txn.kind === "income" ? c.good : c.ink, fontWeight: "700" }}>
            {sign}₪{txn.amount.toFixed(2)}
          </Text>
        </Row>
        <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 4, textAlign: textStart, writingDirection }}>
          {txn.txn_date}
          {txn.category ? ` · ${txn.category}` : txn.needs_categorization ? " · ?" : ""}
          {txn.source === "apple_pay" ? " · Apple Pay" : txn.source === "leumi" ? " · לאומי" : ""}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function FinanceScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const router = useRouter();
  const [month, setMonth] = useState(monthKey());
  const isCurrentMonth = month === monthKey();

  const { data: cashflow, loading: cfLoading, error: cfError, refresh: refreshCf } = useApiQuery(
    queryKeys.financeCashflow(month),
    (cfg) => api.financeCashflow(cfg, month)
  );
  const { data: txns, loading: txLoading, error: txError, refresh: refreshTx } = useApiQuery(
    queryKeys.financeTransactions(month),
    (cfg) => api.financeTransactions(cfg, { month, limit: 100 })
  );

  const loading = cfLoading || txLoading;
  const error = cfError || txError;
  const refresh = () => {
    void refreshCf();
    void refreshTx();
  };

  const uncategorized = useMemo(
    () => (txns ?? []).filter((t) => t.needs_categorization),
    [txns]
  );

  function openCategorize(id: string) {
    router.push(`/finance-categorize?id=${id}` as `/${string}`);
  }

  const cf = cashflow as FinanceCashflow | undefined;
  const maxCategory = cf?.by_category?.[0]?.amount ?? 1;

  return (
    <Screen title={t("finance.title")} subtitle={t("finance.subtitle")} refreshing={loading} onRefresh={refresh}>
      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !cf ? <Loading /> : null}

      <View style={{ ...row, justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={c.accent} />
        </Pressable>
        <Text style={{ color: c.ink, fontWeight: "700", textAlign: "center", writingDirection }}>
          {formatMonthLabel(month, locale)}
        </Text>
        <Pressable
          onPress={() => !isCurrentMonth && setMonth((m) => shiftMonth(m, 1))}
          hitSlop={12}
          style={{ opacity: isCurrentMonth ? 0.3 : 1 }}
          disabled={isCurrentMonth}
        >
          <Ionicons name="chevron-forward" size={22} color={c.accent} />
        </Pressable>
      </View>

      {cf ? (
        <Card>
          <Row>
            <Stat label={t("finance.income")} value={`₪${cf.income.toFixed(0)}`} />
            <Stat label={t("finance.expense")} value={`₪${cf.expense.toFixed(0)}`} />
            <Stat label={t("finance.net")} value={`₪${cf.net.toFixed(0)}`} accent net={cf.net} />
          </Row>
          {cf.uncategorized_count > 0 ? (
            <Text style={{ color: c.warn, marginTop: 8, textAlign: textStart, writingDirection, fontWeight: "600" }}>
              {t("finance.uncategorized")}: {cf.uncategorized_count}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {cf && cf.by_category.length > 0 ? (
        <>
          <SectionTitle>{t("finance.byCategory")}</SectionTitle>
          <Card>
            {cf.by_category.map((item) => (
              <View key={item.category} style={{ marginBottom: 10 }}>
                <Row>
                  <Text style={{ color: c.ink, flex: 1, textAlign: textStart, writingDirection }}>{item.category}</Text>
                  <Text style={{ color: c.muted, fontWeight: "600" }}>₪{item.amount.toFixed(0)}</Text>
                </Row>
                <View
                  style={{
                    height: 4,
                    backgroundColor: c.border,
                    borderRadius: 2,
                    marginTop: 4,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 4,
                      width: `${Math.max(8, (item.amount / maxCategory) * 100)}%`,
                      backgroundColor: c.accent,
                      borderRadius: 2,
                    }}
                  />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {uncategorized.length > 0 ? (
        <>
          <SectionTitle>{t("finance.uncategorized")}</SectionTitle>
          {uncategorized.map((txn) => (
            <TxnRow key={txn.id} txn={txn} onPress={() => openCategorize(txn.id)} />
          ))}
        </>
      ) : null}

      <SectionTitle>{t("finance.allTransactions")}</SectionTitle>
      {!loading && (txns ?? []).length === 0 ? <EmptyState text={t("finance.noTransactions")} /> : null}
      {(txns ?? [])
        .filter((t) => !t.needs_categorization)
        .map((txn) => (
          <TxnRow key={txn.id} txn={txn} onPress={() => openCategorize(txn.id)} />
        ))}

      <Text style={{ color: c.muted, fontSize: tokens.textXs, marginTop: 12, textAlign: textStart, writingDirection }}>
        {t("finance.shortcutHint")}
      </Text>
    </Screen>
  );
}

function Stat({
  label,
  value,
  accent,
  net,
}: {
  label: string;
  value: string;
  accent?: boolean;
  net?: number;
}) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const color = accent ? (net !== undefined && net < 0 ? c.warn : c.accent) : c.ink;
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{label}</Text>
      <Text style={{ color, fontWeight: "700", fontSize: tokens.title, textAlign: textStart, writingDirection }}>
        {value}
      </Text>
    </View>
  );
}
