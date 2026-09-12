import type { FinanceTransaction } from "@/lib/finance/ingest";

export type CashflowRow = Pick<
  FinanceTransaction,
  "txn_date" | "amount" | "kind" | "category" | "needs_categorization"
>;

export type CategorySpend = { category: string; amount: number };

export type CashflowSummary = {
  month: string;
  income: number;
  expense: number;
  net: number;
  uncategorized_count: number;
  by_category: CategorySpend[];
};

export function summarizeCashflow(
  transactions: readonly CashflowRow[],
  month: string
): CashflowSummary {
  let income = 0;
  let expense = 0;
  let uncategorized_count = 0;
  const byCat = new Map<string, number>();

  for (const t of transactions) {
    if (!t.txn_date.startsWith(month)) continue;
    if (t.kind === "income") income += t.amount;
    else {
      expense += t.amount;
      if (t.category) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    }
    if (t.needs_categorization) uncategorized_count += 1;
  }

  const by_category = [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    month,
    income: round2(income),
    expense: round2(expense),
    net: round2(income - expense),
    uncategorized_count,
    by_category,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
