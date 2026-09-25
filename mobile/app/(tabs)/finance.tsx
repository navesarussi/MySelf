import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/resources";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import { useApiQuery, useApiMutation, queryKeys, queryClient } from "../../src/query";
import { PLAN_SECTION_ORDER, type PlanLineType } from "@/lib/finance/expense-type";
import type { MonthPlanView } from "@/lib/finance/plan";
import { normalizeWeeklyPace } from "@/lib/finance/weekly";
import type { FinanceTransaction } from "@/lib/finance/types";
import type { UncategorizedTxn } from "../../src/components/finance/categorize-save";
import { PlanSectionBlock } from "../../src/components/finance/plan-section";
import { WeekStrip } from "../../src/components/finance/week-strip";
import { RemainingWeekCard } from "../../src/components/finance/remaining-week";
import { FinanceHubLinks } from "../../src/components/finance/finance-hub-links";
import { FinanceSourcesStrip } from "../../src/components/finance/finance-sources-strip";
import { AddPlanLineModal } from "../../src/components/finance/add-plan-line-modal";
import { ScreenErrorBoundary } from "../../src/components/error-boundary";
import { FinanceHero } from "../../src/components/finance/finance-hero";
import { FinanceMonthNav } from "../../src/components/finance/month-nav";
import { UncategorizedBlock } from "../../src/components/finance/uncategorized-block";
import { FinanceTxnRow } from "../../src/components/finance/txn-row";
import { RecurringSuggestionsCard } from "../../src/components/finance/recurring-suggestions";
import { EmptyState, ErrorNote, FinancePlanSkeleton, Row, SectionTitle } from "../../src/components/ui";
import { ScreenList } from "../../src/components/screen-list";

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};
const formatMonthLabel = (month: string, locale: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale === "he" ? "he-IL" : "en-US", { month: "long", year: "numeric" });
};
const FUTURE_MONTH_LIMIT = 12;
const PAST_MONTH_LIMIT = 36;

export default function FinanceScreen() {
  const { t, locale } = useI18n();
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const { run } = useApiMutation();
  const [month, setMonth] = useState(monthKey());
  const [showTxns, setShowTxns] = useState(false);
  const [showAllUncat, setShowAllUncat] = useState(false);
  const [addType, setAddType] = useState<PlanLineType | null>(null);
  const current = monthKey();
  const isCurrentMonth = month === current;
  const canGoNext = month < shiftMonth(current, FUTURE_MONTH_LIMIT);
  const canGoPrev = month > shiftMonth(current, -PAST_MONTH_LIMIT);

  useEffect(() => {
    const m = params.month;
    if (typeof m === "string" && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, [params.month]);

  const { data: plan, loading: planLoading, isFetching: planFetching, error: planError, refresh: refreshPlan } = useApiQuery(
    queryKeys.financePlan(month),
    (cfg) => api.financePlan(cfg, month),
    { staleTime: 60_000 }
  );
  const { data: txns, loading: txLoading, refresh: refreshTx } = useApiQuery(
    queryKeys.financeTransactions(month),
    (cfg) => api.financeTransactions(cfg, { month, limit: 100 })
  );
  const { data: uncategorizedPayload, refresh: refreshUncat } = useApiQuery(
    queryKeys.financeUncategorized,
    (cfg) => api.financeTransactions(cfg, { uncategorized: true, limit: 500, includeTotal: true })
  );

  const refresh = () => {
    void refreshPlan();
    void refreshTx();
    void refreshUncat();
    void queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };

  const view = useMemo(() => {
    const p = plan as MonthPlanView | undefined;
    if (!p) return undefined;
    return {
      ...p,
      weekly_pace: normalizeWeeklyPace(p.weekly_pace),
    };
  }, [plan]);
  const uncategorized = (
    Array.isArray(uncategorizedPayload)
      ? uncategorizedPayload
      : (uncategorizedPayload?.items ?? [])
  ) as UncategorizedTxn[];
  const uncategorizedTotal =
    Array.isArray(uncategorizedPayload) ? uncategorized.length : (uncategorizedPayload?.total ?? uncategorized.length);

  const openTxn = useCallback(
    (item: FinanceTransaction) => {
      const route = item.needs_categorization ? `/finance-categorize?id=${item.id}` : `/finance-transaction?id=${item.id}`;
      router.push(route as `/${string}`);
    },
    [router]
  );

  const savePlanned = (lineId: string, amount: number) =>
    run((cfg) => api.patchFinancePlanLine(cfg, lineId, amount), {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) }),
    });

  const changeLineType = (lineId: string, line_type: PlanLineType) =>
    run((cfg) => api.patchFinancePlanLine(cfg, lineId, { line_type }), {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) }),
    });

  const addLine = (name: string, amount: number) => {
    if (!addType) return;
    return run((cfg) => api.addFinancePlanLine(cfg, { month, line_type: addType, name, planned_amount: amount }), {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) }),
    });
  };

  const deleteLine = (lineId: string) =>
    run((cfg) => api.deleteFinancePlanLine(cfg, lineId), {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) }),
    });

  const saveWeeklyBudget = (amount: number | null) =>
    run((cfg) => api.patchFinancePlan(cfg, month, { weekly_budget_override: amount }), {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) }),
    });

  const renderTxn = useCallback(
    ({ item }: { item: FinanceTransaction }) => <FinanceTxnRow txn={item} onPress={() => openTxn(item)} />,
    [openTxn]
  );

  const headerExtra = (
    <>
      {planError && !view ? <ErrorNote message={planError} onRetry={refresh} /> : null}
      {planLoading && !view ? <FinancePlanSkeleton /> : null}
      <FinanceMonthNav
        label={formatMonthLabel(month, locale)}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrev={() => setMonth((m) => shiftMonth(m, -1))}
        onNext={() => setMonth((m) => shiftMonth(m, 1))}
        onLabelPress={isCurrentMonth ? undefined : () => setMonth(current)}
      />
      <FinanceHubLinks />
      <FinanceSourcesStrip />
      <RecurringSuggestionsCard month={month} onApplied={refresh} />
      {view ? <FinanceHero view={view} /> : null}
      {view?.weekly_pace ? (
        <RemainingWeekCard pace={view.weekly_pace} onEditBudget={(amt) => void saveWeeklyBudget(amt)} />
      ) : null}
      <UncategorizedBlock
        items={uncategorized}
        totalCount={uncategorizedTotal}
        expanded={showAllUncat}
        onToggle={() => setShowAllUncat((v) => !v)}
        onCategorized={refresh}
        onOpen={(id) => {
          const txn = uncategorized.find((t) => t.id === id);
          if (txn) openTxn(txn);
        }}
      />
      {view
        ? PLAN_SECTION_ORDER.map((type) => {
            const section = view.sections?.[type];
            if (!section) return null;
            return (
            <PlanSectionBlock
              key={type}
              section={section}
              onSavePlanned={(id, amount) => void savePlanned(id, amount)}
              onChangeLineType={(id, lt) => void changeLineType(id, lt)}
              onAdd={type === "planned" || type === "savings" ? () => setAddType(type) : undefined}
              onDelete={type === "planned" || type === "savings" ? (id) => void deleteLine(id) : undefined}
            />
            );
          })
        : null}
      {view?.weeks.length ? <WeekStrip weeks={view.weeks} /> : null}
      <Pressable onPress={() => setShowTxns((v) => !v)} accessibilityRole="button" style={{ marginVertical: 4 }}>
        <Row>
          <SectionTitle>{t("finance.allTransactions")}</SectionTitle>
          <Ionicons name={showTxns ? "chevron-up" : "chevron-down"} size={18} color={c.muted} />
        </Row>
      </Pressable>
      {!showTxns ? (
        <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 8, textAlign: textStart, writingDirection }}>
          {t("finance.subtitle")}
        </Text>
      ) : null}
    </>
  );

  return (
    <ScreenErrorBoundary name="finance">
    <>
      <ScreenList
        title={t("finance.title")}
        subtitle={t("finance.subtitlePlan")}
        headerExtra={headerExtra}
        data={showTxns ? (txns ?? []) : []}
        renderItem={renderTxn}
        keyExtractor={(item) => item.id}
        refreshing={planFetching}
        onRefresh={refresh}
        maxWidth={720}
        ListEmptyComponent={showTxns && !txLoading ? <EmptyState text={t("finance.noTransactions")} /> : null}
      />
      {addType ? (
        <AddPlanLineModal visible lineType={addType} onClose={() => setAddType(null)} onSave={(n, a) => void addLine(n, a)} />
      ) : null}
    </>
    </ScreenErrorBoundary>
  );
}
