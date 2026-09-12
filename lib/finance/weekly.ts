import type { FinanceTransaction } from "@/lib/finance/ingest";
import { lineTypeForCategory } from "@/lib/finance/expense-type";

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
  spent: number;
  left: number;
};

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  // Back to Sunday
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
      else {
        expense += t.amount;
        if (lineTypeForCategory(t.category, "expense") === "variable") {
          variable_expense += t.amount;
        }
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

/** Variable budget split evenly across weeks; leftover for the current week. */
export function weeklyVariablePace(
  weeks: WeekBucket[],
  variablePlanned: number,
  today = new Date()
): WeeklyPace | null {
  if (weeks.length === 0) return null;
  const todayIso = formatDate(today);
  const current =
    weeks.find((w) => todayIso >= w.start && todayIso <= w.end) ?? weeks[weeks.length - 1];
  const variable_budget = round2(variablePlanned / weeks.length);
  return {
    week: current.week,
    weeks_in_month: weeks.length,
    variable_budget,
    spent: current.variable_expense,
    left: round2(variable_budget - current.variable_expense),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
