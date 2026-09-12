import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import { useApiQuery, useApiMutation, queryKeys, queryClient } from "../../src/query";
import { PLAN_SECTION_ORDER } from "@/lib/finance/expense-type";
import type { MonthPlanView } from "@/lib/finance/plan";
import type { PlanLineType } from "@/lib/finance/expense-type";
import { PlanSectionBlock } from "../../src/components/finance/plan-section";
import { WeekStrip } from "../../src/components/finance/week-strip";
import { RemainingWeekCard } from "../../src/components/finance/remaining-week";
import { AddPlanLineModal } from "../../src/components/finance/add-plan-line-modal";
import {
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  Row,
  Screen,
  SectionTitle,
} from "../../src/components/ui";
import type { FinanceTransaction } from "@/lib/finance/types";

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
          {txn.category ? ` · ${txn.category}` : ""}
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
  const { run } = useApiMutation();
  const [month, setMonth] = useState(monthKey());
  const [showTxns, setShowTxns] = useState(false);
  const [showAllUncat, setShowAllUncat] = useState(false);
  const [addType, setAddType] = useState<PlanLineType | null>(null);
  const isCurrentMonth = month === monthKey();

  const { data: plan, loading: planLoading, error: planError, refresh: refreshPlan } = useApiQuery(
    queryKeys.financePlan(month),
    (cfg) => api.financePlan(cfg, month)
  );
  const { data: txns, loading: txLoading, refresh: refreshTx } = useApiQuery(
    queryKeys.financeTransactions(month),
    (cfg) => api.financeTransactions(cfg, { month, limit: 100 })
  );

  const loading = planLoading;
  const error = planError;
  const refresh = () => {
    void refreshPlan();
    void refreshTx();
  };

  const view = plan as MonthPlanView | undefined;
  const uncategorized = useMemo(
    () => (txns ?? []).filter((t) => t.needs_categorization),
    [txns]
  );

  function openCategorize(id: string) {
    router.push(`/finance-categorize?id=${id}` as `/${string}`);
  }

  async function savePlanned(lineId: string, amount: number) {
    await run(
      (cfg) => api.patchFinancePlanLine(cfg, lineId, amount),
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
        },
      }
    );
  }

  async function addLine(name: string, amount: number) {
    if (!addType) return;
    await run(
      (cfg) =>
        api.addFinancePlanLine(cfg, {
          month,
          line_type: addType,
          name,
          planned_amount: amount,
        }),
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
        },
      }
    );
  }

  async function deleteLine(lineId: string) {
    await run(
      (cfg) => api.deleteFinancePlanLine(cfg, lineId),
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
        },
      }
    );
  }

  const netColor =
    view && view.totals.net_actual < 0 ? c.warn : view && view.totals.net_actual > 0 ? c.good : c.ink;

  return (
    <Screen title={t("finance.title")} subtitle={t("finance.subtitlePlan")} refreshing={loading} onRefresh={refresh}>
      {error ? <ErrorNote message={error} onRetry={refresh} /> : null}
      {loading && !view ? <Loading /> : null}

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

      {view ? (
        <Card>
          <Row>
            <SummaryCell label={t("finance.income")} value={`₪${view.totals.actual_income.toFixed(0)}`} sub={`/ ₪${view.totals.planned_income.toFixed(0)}`} />
            <SummaryCell label={t("finance.expense")} value={`₪${view.totals.actual_expense.toFixed(0)}`} sub={`/ ₪${view.totals.planned_expense.toFixed(0)}`} />
            <SummaryCell label={t("finance.net")} value={`₪${view.totals.net_actual.toFixed(0)}`} valueColor={netColor} />
          </Row>
          {view.totals.savings_planned > 0 ? (
            <Text style={{ color: c.accent, marginTop: 8, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {t("finance.savingsTarget")}: ₪{view.totals.savings_planned.toFixed(0)}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {view?.weekly_pace ? <RemainingWeekCard pace={view.weekly_pace} /> : null}

      {uncategorized.length > 0 ? (
        <>
          <SectionTitle>{t("finance.uncategorized")} ({uncategorized.length})</SectionTitle>
          {(showAllUncat ? uncategorized : uncategorized.slice(0, 3)).map((txn) => (
            <TxnRow key={txn.id} txn={txn} onPress={() => openCategorize(txn.id)} />
          ))}
          {uncategorized.length > 3 ? (
            <Pressable onPress={() => setShowAllUncat((v) => !v)} style={{ marginBottom: 8 }}>
              <Text style={{ color: c.accent, textAlign: textStart, writingDirection }}>
                {showAllUncat ? t("finance.showLess") : t("finance.showMore", { count: String(uncategorized.length - 3) })}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {view ? (
        <>
          {PLAN_SECTION_ORDER.map((type) => (
            <PlanSectionBlock
              key={type}
              section={view.sections[type]}
              onSavePlanned={(id, amount) => void savePlanned(id, amount)}
              onAdd={type === "planned" || type === "savings" ? () => setAddType(type) : undefined}
              onDelete={type === "planned" || type === "savings" ? (id) => void deleteLine(id) : undefined}
            />
          ))}
          {view.weeks.length > 0 ? <WeekStrip weeks={view.weeks} /> : null}
        </>
      ) : null}

      <Pressable onPress={() => setShowTxns((v) => !v)} style={{ marginTop: 8, marginBottom: 4 }}>
        <Row>
          <SectionTitle>{t("finance.allTransactions")}</SectionTitle>
          <Ionicons name={showTxns ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
        </Row>
      </Pressable>
      {showTxns ? (
        <>
          {!txLoading && (txns ?? []).length === 0 ? <EmptyState text={t("finance.noTransactions")} /> : null}
          {(txns ?? []).map((txn) => (
            <TxnRow key={txn.id} txn={txn} onPress={() => openCategorize(txn.id)} />
          ))}
        </>
      ) : null}

      {addType ? (
        <AddPlanLineModal
          visible
          lineType={addType}
          onClose={() => setAddType(null)}
          onSave={(name, amount) => void addLine(name, amount)}
        />
      ) : null}
    </Screen>
  );
}

function SummaryCell({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{label}</Text>
      <Text style={{ color: valueColor ?? c.ink, fontWeight: "700", fontSize: tokens.title, textAlign: textStart, writingDirection }}>
        {value}
      </Text>
      {sub ? (
        <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{sub}</Text>
      ) : null}
    </View>
  );
}
