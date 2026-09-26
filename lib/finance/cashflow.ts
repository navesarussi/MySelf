import type { FinanceTransaction } from "@/lib/finance/ingest";
import {
  expenseCountsTowardNet,
  monthNetFromTransactions,
  type MonthNetSplit,
  type MonthNetTxn,
} from "@/lib/finance/month-net";
import type { MerchantRule } from "@/lib/finance/merchant-rules";
import { round2 } from "@/lib/finance/money";

export type CashflowRow = Pick<
  FinanceTransaction,
  "txn_date" | "amount" | "kind" | "category" | "needs_categorization"
> & {
  id?: string;
  is_internal?: boolean;
  merchant?: string | null;
  description?: string | null;
  expense_type?: FinanceTransaction["expense_type"];
};

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
  month: string,
  rulesMap?: Map<string, MerchantRule>,
  splitsByParentId?: ReadonlyMap<string, readonly MonthNetSplit[]>
): CashflowSummary {
  const netTotals = monthNetFromTransactions(transactions, month, rulesMap, splitsByParentId);
  let uncategorized_count = 0;
  const byCat = new Map<string, number>();

  for (const t of transactions) {
    if (t.is_internal || !t.txn_date.startsWith(month)) continue;
    if (t.needs_categorization) uncategorized_count += 1;

    const splits = t.id ? splitsByParentId?.get(t.id) : undefined;
    if (splits && splits.length > 0) {
      for (const part of splits) {
        if (part.kind !== "expense") continue;
        if (
          !expenseCountsTowardNet(
            {
              merchant: t.merchant,
              description: t.description,
              category: t.category,
              explicitExpenseType: part.expense_type,
            },
            rulesMap
          )
        ) {
          continue;
        }
        const category = t.category ?? "אחר";
        byCat.set(category, (byCat.get(category) ?? 0) + Number(part.amount));
      }
      continue;
    }

    if (
      t.kind === "expense" &&
      expenseCountsTowardNet(
        {
          merchant: t.merchant,
          description: t.description,
          category: t.category,
          explicitExpenseType: t.expense_type,
        },
        rulesMap
      ) &&
      t.category
    ) {
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
    }
  }

  const by_category = [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  return {
    month,
    income: netTotals.actual_income,
    expense: netTotals.actual_expense,
    net: netTotals.net_actual,
    uncategorized_count,
    by_category,
  };
}
