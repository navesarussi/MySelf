import type { FinanceTransaction } from "@/lib/finance/ingest";
import { lineTypeForCategory } from "@/lib/finance/expense-type";
import { round2 } from "@/lib/finance/money";

export type WeekBucket = {
  week: number;
  label: string;
  start: string;
  end: string;
  expense: number;
  variable_expense: number;
  income: number;
};

export type WeeklyPace = {
  week: number;
  weeks_in_month: number;
  variable_budget: number;
  computed_budget: number;
  is_override: boolean;
  spent: number;
  left: number;
};

export type WeeklyBudgetInput = {
  variablePlanned?: number;
  plannedIncome?: number;
  plannedFixed?: number;
  plannedSavings?: number;
  weeklyOverride?: number | null;
};

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isVariableExpense(t: FinanceTransaction): boolean {
  if (t.kind !== "expense" || t.is_internal) return false;
  if (t.expense_type === "variable") return true;
  if (t.expense_type === "fixed" || t.expense_type === "savings") return false;
  return lineTypeForCategory(t.category, "expense") === "variable";
}

/** Normalize cached/API pace objects (handles older clients missing new fields). */
export function normalizeWeeklyPace(raw: Partial<WeeklyPace> | null | undefined): WeeklyPace | null {
  if (!raw || raw.week == null) return null;
  const variable_budget = Number(raw.variable_budget) || 0;
  const computed_budget = Number(raw.computed_budget) || variable_budget;
  const spent = Number(raw.spent) || 0;
  const left = raw.left != null ? Number(raw.left) : round2(variable_budget - spent);
  return {
    week: raw.week,
    weeks_in_month: raw.weeks_in_month ?? 4,
    variable_budget,
    computed_budget,
    is_override: Boolean(raw.is_override),
    spent,
    left,
  };
}

/** Calendar weeks (Sun–Sat) overlapping the month. */
export function weekBucketsForMonth(
  month: string,
  transactions: FinanceTransaction[]
): WeekBucket[] {
  const [y, m] = month.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);

  const buckets: WeekBucket[] = [];
  let cursor = new Date(monthStart);
  cursor.setDate(cursor.getDate() - cursor.getDay());

  let week = 1;
  while (cursor <= monthEnd) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);

    const startIso = formatDate(start);
    const endIso = formatDate(end);
    let expense = 0;
    let variable_expense = 0;
    let income = 0;

    for (const t of transactions) {
      if (!t.txn_date.startsWith(month)) continue;
      const d = parseDate(t.txn_date);
      if (d < start || d > end) continue;
      if (t.kind === "income") income += t.amount;
      else if (!t.is_internal) {
        expense += t.amount;
        if (isVariableExpense(t)) variable_expense += t.amount;
      }
    }

    const overlapsMonth = end >= monthStart && start <= monthEnd;
    if (overlapsMonth) {
      buckets.push({
        week,
        label: `שבוע ${week}`,
        start: startIso,
        end: endIso,
        expense: round2(expense),
        variable_expense: round2(variable_expense),
        income: round2(income),
      });
      week += 1;
    }
    cursor.setDate(cursor.getDate() + 7);
  }

  return buckets;
}

/** Weekly discretionary budget from plan; optional per-month override. */
export function weeklyVariablePace(
  weeks: WeekBucket[],
  budget: WeeklyBudgetInput,
  today = new Date()
): WeeklyPace | null {
  if (weeks.length === 0) return null;
  const todayIso = formatDate(today);
  const current =
    weeks.find((w) => todayIso >= w.start && todayIso <= w.end) ?? weeks[weeks.length - 1];

  const fromPlan = round2(
    ((budget.plannedIncome ?? 0) -
      (budget.plannedFixed ?? 0) -
      (budget.plannedSavings ?? 0)) /
      weeks.length
  );
  const fallback = round2((budget.variablePlanned ?? 0) / weeks.length);
  const computed_budget = fromPlan > 0 ? fromPlan : fallback;
  const override = budget.weeklyOverride;
  const variable_budget =
    override != null && override >= 0 ? round2(override) : computed_budget;

  return normalizeWeeklyPace({
    week: current.week,
    weeks_in_month: weeks.length,
    variable_budget,
    computed_budget,
    is_override: override != null && override >= 0,
    spent: current.variable_expense,
    left: round2(variable_budget - current.variable_expense),
  });
}
