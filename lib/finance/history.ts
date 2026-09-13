import { summarizeCashflow, type CashflowRow, type CategorySpend } from "@/lib/finance/cashflow";

export const HISTORY_MONTH_OPTIONS = [3, 6, 12] as const;
export type HistoryMonths = (typeof HISTORY_MONTH_OPTIONS)[number];

export type HistoryPlanSlice = {
  planned_income: number;
  actual_income: number;
  planned_expense: number;
  actual_expense: number;
  net_planned: number;
  net_actual: number;
  savings_planned: number;
};

export type HistoryCategoryDelta = {
  category: string;
  amount: number;
  prev_amount: number;
  delta: number;
};

export type HistoryMonthRow = {
  month: string;
  income: number;
  expense: number;
  net: number;
  by_category: CategorySpend[];
  plan: HistoryPlanSlice | null;
  category_deltas: HistoryCategoryDelta[];
};

export type FinanceHistory = {
  months: HistoryMonths;
  end_month: string;
  rows: HistoryMonthRow[];
};

export type HistoryPlanSeed = {
  month: string;
  planned_income: number;
  planned_fixed: number;
  planned_variable: number;
  planned_planned: number;
  savings_planned: number;
};

export function parseHistoryMonths(raw: string | null): HistoryMonths | null {
  if (raw == null || raw === "") return 6;
  const n = Number(raw);
  if (n === 3 || n === 6 || n === 12) return n;
  return null;
}

/** Oldest → newest, inclusive of endMonth. */
export function monthKeysEndingAt(endMonth: string, count: number): string[] {
  const [y0, m0] = endMonth.split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y0, m0 - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function categoryDeltas(
  current: CategorySpend[],
  previous: CategorySpend[] | null,
  limit = 5
): HistoryCategoryDelta[] {
  const prevMap = new Map((previous ?? []).map((c) => [c.category, c.amount]));
  const cats = new Set<string>([
    ...current.map((c) => c.category),
    ...(previous ?? []).map((c) => c.category),
  ]);
  const rows: HistoryCategoryDelta[] = [];
  for (const category of cats) {
    const amount = current.find((c) => c.category === category)?.amount ?? 0;
    const prev_amount = prevMap.get(category) ?? 0;
    const delta = round2(amount - prev_amount);
    if (delta === 0) continue;
    rows.push({ category, amount, prev_amount, delta });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows.slice(0, limit);
}

function planSliceForMonth(
  seed: HistoryPlanSeed | undefined,
  income: number,
  expense: number
): HistoryPlanSlice | null {
  if (!seed) return null;
  const planned_expense = round2(seed.planned_fixed + seed.planned_variable + seed.planned_planned);
  const savings_planned = round2(seed.savings_planned);
  const planned_income = round2(seed.planned_income);
  return {
    planned_income,
    actual_income: income,
    planned_expense,
    actual_expense: expense,
    net_planned: round2(planned_income - planned_expense - savings_planned),
    net_actual: round2(income - expense),
    savings_planned,
  };
}

export function buildFinanceHistory(input: {
  endMonth: string;
  months: HistoryMonths;
  transactions: readonly CashflowRow[];
  planSeeds: readonly HistoryPlanSeed[];
}): FinanceHistory {
  const keys = monthKeysEndingAt(input.endMonth, input.months);
  const seedByMonth = new Map(input.planSeeds.map((s) => [s.month, s]));
  const summaries = keys.map((month) => summarizeCashflow(input.transactions, month));

  const rows: HistoryMonthRow[] = summaries.map((summary, i) => {
    const prev = i > 0 ? summaries[i - 1] : null;
    return {
      month: summary.month,
      income: summary.income,
      expense: summary.expense,
      net: summary.net,
      by_category: summary.by_category,
      plan: planSliceForMonth(seedByMonth.get(summary.month), summary.income, summary.expense),
      category_deltas: categoryDeltas(summary.by_category, prev?.by_category ?? null),
    };
  });

  return { months: input.months, end_month: input.endMonth, rows };
}
