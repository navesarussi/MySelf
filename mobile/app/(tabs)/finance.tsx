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
import { normalizeWeeklyPace, resolveWeeklyBudgetOverrideValue } from "@/lib/finance/weekly";
import type { FinanceTransaction } from "@/lib/finance/types";
import type { FixedExpenseItem } from "@/lib/finance/fixed-expenses";
import { buildVariableBreakdown } from "@/lib/finance/variable-breakdown";
import type { UncategorizedTxn } from "../../src/components/finance/categorize-save";
import { PlanSectionBlock } from "../../src/components/finance/plan-section";
import { WeekStrip } from "../../src/components/finance/week-strip";
import { RemainingWeekCard } from "../../src/components/finance/remaining-week";
import { FixedExpensesSection } from "../../src/components/finance/fixed-expenses-section";
import { VariableExpensesSection } from "../../src/components/finance/variable-expenses-section";
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
import { useFinanceSectionCollapse } from "../../src/hooks/use-finance-section-collapse";

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
  const [weeklySaveError, setWeeklySaveError] = useState<string | null>(null);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const collapse = useFinanceSectionCollapse(month);
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
    (cfg) => api.financeTransactions(cfg, { month, limit: 500 })
  );
  const { data: uncategorizedPayload, refresh: refreshUncat } = useApiQuery(
    queryKeys.financeUncategorized,
    (cfg) => api.financeTransactions(cfg, { uncategorized: true, limit: 500, includeTotal: true })
  );
  const { data: fixedPayload, loading: fixedLoading, error: fixedError, refresh: refreshFixed } = useApiQuery(
    queryKeys.financeFixedExpenses(month),
    (cfg) => api.financeFixedExpenses(cfg, month),
    { staleTime: 60_000 }
  );
  const { data: categoriesPayload } = useApiQuery(
    queryKeys.financeCategories,
    (cfg) => api.financeCategories(cfg),
    { staleTime: 300_000 }
  );

  const refresh = () => {
    void refreshPlan();
    void refreshTx();
    void refreshUncat();
    void refreshFixed();
    void queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };

  const view = useMemo(() => {
    const p = plan as MonthPlanView | undefined;
    if (!p) return undefined;
    return { ...p, weekly_pace: normalizeWeeklyPace(p.weekly_pace) };
  }, [plan]);

  const monthTxns = useMemo(
    () => (Array.isArray(txns) ? txns : (txns?.items ?? [])) as FinanceTransaction[],
    [txns]
  );
  const variableGroups = useMemo(() => buildVariableBreakdown(month, monthTxns), [month, monthTxns]);
  const fixedItems = (fixedPayload?.items ?? []) as FixedExpenseItem[];
  const categories = categoriesPayload?.categories ?? [];

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

  const invalidateFinance = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.financeTransactions(month) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.financeFixedExpenses(month) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.home });
  };

  const savePlanned = (lineId: string, amount: number) =>
    run((cfg) => api.patchFinancePlanLine(cfg, lineId, amount), { onSuccess: invalidateFinance });

  const changeLineType = (lineId: string, line_type: PlanLineType) =>
    run((cfg) => api.patchFinancePlanLine(cfg, lineId, { line_type }), { onSuccess: invalidateFinance });

  const addLine = (name: string, amount: number) => {
    if (!addType) return;
    return run((cfg) => api.addFinancePlanLine(cfg, { month, line_type: addType, name, planned_amount: amount }), {
      onSuccess: invalidateFinance,
    });
  };

  const deleteLine = (lineId: string) =>
    run((cfg) => api.deleteFinancePlanLine(cfg, lineId), { onSuccess: invalidateFinance });

  const saveWeeklyBudget = async (amount: number | null): Promise<boolean> => {
    setWeeklySaveError(null);
    const pace = view?.weekly_pace;
    const normalized =
      amount == null || !pace
        ? amount
        : resolveWeeklyBudgetOverrideValue(amount, pace.computed_budget);
    const prevPlan = queryClient.getQueryData<MonthPlanView>(queryKeys.financePlan(month));
    if (prevPlan?.weekly_pace) {
      const nextPace = normalizeWeeklyPace({
        ...prevPlan.weekly_pace,
        variable_budget: normalized ?? prevPlan.weekly_pace.computed_budget,
        is_override: normalized != null,
        left: (normalized ?? prevPlan.weekly_pace.computed_budget) - prevPlan.weekly_pace.spent,
      });
      queryClient.setQueryData<MonthPlanView>(queryKeys.financePlan(month), {
        ...prevPlan,
        weekly_budget_override: normalized,
        weekly_pace: nextPace,
      });
    }
    setWeeklySaving(true);
    const result = await run(
      (cfg) => api.patchFinancePlan(cfg, month, { weekly_budget_override: normalized }),
      {
        onSuccess: () => invalidateFinance(),
        onError: () => {
          if (prevPlan) queryClient.setQueryData(queryKeys.financePlan(month), prevPlan);
          setWeeklySaveError(t("finance.weeklyBudgetSaveFailed"));
        },
      }
    );
    setWeeklySaving(false);
    return result != null;
  };

  const saveFixedExpense = async (
    item: FixedExpenseItem,
    patch: {
      name: string;
      planned_amount: number;
      category: string | null;
      frequency: FixedExpenseItem["frequency"];
      charge_day: number | null;
      default_note: string | null;
      is_active: boolean;
      merchant_key?: string;
    }
  ): Promise<boolean> => {
    if (item.rule_id) {
      const result = await run(
        (cfg) =>
          api.patchFinanceMerchantRule(cfg, item.rule_id!, {
            display_name: patch.name,
            planned_amount: patch.planned_amount,
            category: patch.category,
            frequency: patch.frequency,
            charge_day: patch.charge_day,
            default_note: patch.default_note,
            is_active: patch.is_active,
            expense_type: "fixed",
          }),
        { onSuccess: invalidateFinance }
      );
      return result != null;
    }
    const result = await run(
      (cfg) =>
        api.createFinanceMerchantRule(cfg, {
          merchant_key: patch.name,
          display_name: patch.name,
          category: patch.category,
          planned_amount: patch.planned_amount,
          frequency: patch.frequency,
          charge_day: patch.charge_day,
          default_note: patch.default_note,
          is_active: patch.is_active,
        }),
      { onSuccess: invalidateFinance }
    );
    return result != null;
  };

  const addFixedExpense = async (patch: {
    name: string;
    planned_amount: number;
    category: string | null;
    frequency: FixedExpenseItem["frequency"];
    charge_day: number | null;
    default_note: string | null;
    is_active: boolean;
  }): Promise<boolean> => {
    const result = await run(
      (cfg) =>
        api.createFinanceMerchantRule(cfg, {
          merchant_key: patch.name,
          display_name: patch.name,
          category: patch.category,
          planned_amount: patch.planned_amount,
          frequency: patch.frequency,
          charge_day: patch.charge_day,
          default_note: patch.default_note,
          is_active: patch.is_active,
        }),
      { onSuccess: invalidateFinance }
    );
    return result != null;
  };

  const deleteFixedExpense = async (item: FixedExpenseItem): Promise<boolean> => {
    if (!item.rule_id) return false;
    const result = await run((cfg) => api.deleteFinanceMerchantRule(cfg, item.rule_id!), {
      onSuccess: invalidateFinance,
    });
    return result != null;
  };

  const saveVariableTxn = async (
    id: string,
    patch: {
      category: string | null;
      purpose_note: string | null;
      amount?: number;
      expense_type?: "fixed" | "variable" | "savings" | null;
      remember_rule?: boolean;
      is_internal?: boolean;
    }
  ): Promise<boolean> => {
    const result = await run((cfg) => api.patchFinanceTransaction(cfg, id, patch), {
      onSuccess: invalidateFinance,
    });
    return result != null;
  };

  const deleteVariableTxn = async (id: string): Promise<boolean> => {
    const result = await run((cfg) => api.deleteFinanceTransaction(cfg, id), { onSuccess: invalidateFinance });
    return result != null;
  };

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
        <RemainingWeekCard
          pace={view.weekly_pace}
          onSaveBudget={saveWeeklyBudget}
          saving={weeklySaving}
          saveError={weeklySaveError}
          onRetrySave={() => setWeeklySaveError(null)}
        />
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
            if (type === "fixed") {
              return (
                <FixedExpensesSection
                  key={type}
                  items={fixedItems}
                  loading={fixedLoading}
                  error={fixedError}
                  categories={categories}
                  collapsed={collapse.isCollapsed("fixed", false)}
                  onToggleCollapse={() => collapse.toggle("fixed")}
                  onRetry={refreshFixed}
                  onSave={saveFixedExpense}
                  onDelete={deleteFixedExpense}
                  onAdd={addFixedExpense}
                />
              );
            }
            if (type === "variable") {
              return (
                <VariableExpensesSection
                  key={type}
                  groups={variableGroups}
                  loading={txLoading}
                  sectionCollapsed={collapse.isCollapsed("variable", false)}
                  onToggleSection={() => collapse.toggle("variable")}
                  isCategoryCollapsed={(cat) => collapse.isCollapsed(`variable:${cat}`, true)}
                  onToggleCategory={(cat) => collapse.toggle(`variable:${cat}`)}
                  categories={categories}
                  onSaveTxn={saveVariableTxn}
                  onDeleteTxn={deleteVariableTxn}
                />
              );
            }
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
          data={showTxns ? monthTxns : []}
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
