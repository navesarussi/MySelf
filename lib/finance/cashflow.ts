import type { FinanceTransaction } from "@/lib/finance/ingest";

export type CashflowSummary = {
  month: string;
  income: number;
  expense: number;
  net: number;
  uncategorized_count: number;
};

export function summarizeCashflow(
  transactions: FinanceTransaction[],
  month: string
): CashflowSummary {
  let income = 0;
  let expense = 0;
  let uncategorized_count = 0;

  for (const t of transactions) {
    if (!t.txn_date.startsWith(month)) continue;
    if (t.kind === "income") income += t.amount;
    else expense += t.amount;
    if (t.needs_categorization) uncategorized_count += 1;
  }

  return {
    month,
    income: round2(income),
    expense: round2(expense),
    net: round2(income - expense),
    uncategorized_count,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
