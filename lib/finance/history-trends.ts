import type { HistoryMonthRow } from "@/lib/finance/history";
import { round2 } from "@/lib/finance/money";

export type TrendDirection = "up" | "down" | "flat";

export type HistoryTrendMetric = {
  direction: TrendDirection;
  /** % change: recent half avg vs older half avg (expense/income) or same for net */
  change_pct: number;
};

export type HistoryCategoryTotal = {
  category: string;
  amount: number;
  share_pct: number;
};

export type HistoryPlanSummary = {
  months_with_plan: number;
  total_planned_net: number;
  total_actual_net: number;
  variance: number;
};

export type HistoryTrends = {
  total_income: number;
  total_expense: number;
  total_net: number;
  avg_income: number;
  avg_expense: number;
  avg_net: number;
  income_trend: HistoryTrendMetric;
  expense_trend: HistoryTrendMetric;
  net_trend: HistoryTrendMetric;
  series: Array<{ month: string; income: number; expense: number; net: number }>;
  top_categories: HistoryCategoryTotal[];
  plan_summary: HistoryPlanSummary;
};


function sum(nums: number[]): number {
  return round2(nums.reduce((a, b) => a + b, 0));
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return round2(sum(nums) / nums.length);
}

/** Recent half vs older half; flat when <2 months or change under 3%. */
export function halfPeriodTrend(values: number[]): HistoryTrendMetric {
  if (values.length < 2) return { direction: "flat", change_pct: 0 };
  const mid = Math.floor(values.length / 2);
  const older = values.slice(0, mid);
  const recent = values.slice(mid);
  const olderAvg = avg(older);
  const recentAvg = avg(recent);
  if (olderAvg === 0 && recentAvg === 0) return { direction: "flat", change_pct: 0 };
  const base = olderAvg === 0 ? recentAvg : olderAvg;
  const change_pct = round2(((recentAvg - olderAvg) / Math.abs(base)) * 100);
  if (Math.abs(change_pct) < 3) return { direction: "flat", change_pct };
  return { direction: change_pct > 0 ? "up" : "down", change_pct };
}

function aggregateCategories(rows: HistoryMonthRow[], limit = 8): HistoryCategoryTotal[] {
  const totals = new Map<string, number>();
  let expenseTotal = 0;
  for (const row of rows) {
    for (const c of row.by_category) {
      totals.set(c.category, (totals.get(c.category) ?? 0) + c.amount);
      expenseTotal += c.amount;
    }
  }
  const sorted = [...totals.entries()]
    .map(([category, amount]) => ({
      category,
      amount: round2(amount),
      share_pct: expenseTotal > 0 ? round2((amount / expenseTotal) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  return sorted.slice(0, limit);
}

function planSummary(rows: HistoryMonthRow[]): HistoryPlanSummary {
  let months_with_plan = 0;
  let total_planned_net = 0;
  let total_actual_net = 0;
  for (const row of rows) {
    if (!row.plan) continue;
    months_with_plan += 1;
    total_planned_net += row.plan.net_planned;
    total_actual_net += row.plan.net_actual;
  }
  return {
    months_with_plan,
    total_planned_net: round2(total_planned_net),
    total_actual_net: round2(total_actual_net),
    variance: round2(total_actual_net - total_planned_net),
  };
}

export function buildHistoryTrends(rows: HistoryMonthRow[]): HistoryTrends {
  const incomes = rows.map((r) => r.income);
  const expenses = rows.map((r) => r.expense);
  const nets = rows.map((r) => r.net);
  const n = rows.length;

  return {
    total_income: sum(incomes),
    total_expense: sum(expenses),
    total_net: sum(nets),
    avg_income: avg(incomes),
    avg_expense: avg(expenses),
    avg_net: avg(nets),
    income_trend: halfPeriodTrend(incomes),
    expense_trend: halfPeriodTrend(expenses),
    net_trend: halfPeriodTrend(nets),
    series: rows.map((r) => ({ month: r.month, income: r.income, expense: r.expense, net: r.net })),
    top_categories: aggregateCategories(rows),
    plan_summary: planSummary(rows),
  };
}
