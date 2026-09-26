import { round2 } from "@/lib/finance/money";
import {
  resolveExpenseType,
  type ExpenseType,
  type MerchantRule,
} from "@/lib/finance/merchant-rules-client";

type NetRow = { kind: string; amount: number | string | null };

export type MonthNetTxn = {
  id?: string;
  txn_date: string;
  amount: number;
  kind: string;
  is_internal?: boolean;
  merchant?: string | null;
  description?: string | null;
  category?: string | null;
  expense_type?: ExpenseType | null;
};

export type MonthNetSplit = {
  amount: number;
  kind: "income" | "expense";
  expense_type?: ExpenseType | null;
};

export type MonthNetTotals = {
  actual_income: number;
  actual_expense: number;
  net_actual: number;
};

function inMonth(txn_date: string, month: string): boolean {
  return txn_date.startsWith(month);
}

export function expenseCountsTowardNet(
  input: {
    merchant?: string | null;
    description?: string | null;
    category?: string | null;
    explicitExpenseType?: ExpenseType | null;
  },
  rulesMap?: Map<string, MerchantRule>
): boolean {
  const lineType = resolveExpenseType({
    merchant: input.merchant,
    description: input.description,
    category: input.category,
    kind: "expense",
    explicitExpenseType: input.explicitExpenseType,
    rules: rulesMap,
  });
  return lineType !== "savings";
}

/**
 * Canonical month net: actual income minus actual spending expenses.
 * Savings transfers are tracked separately and do not reduce net.
 * Internal transfers and soft-deleted rows must be filtered before calling.
 */
export function monthNetFromTransactions(
  txns: readonly MonthNetTxn[],
  month: string,
  rulesMap?: Map<string, MerchantRule>,
  splitsByParentId?: ReadonlyMap<string, readonly MonthNetSplit[]>
): MonthNetTotals {
  let actual_income = 0;
  let actual_expense = 0;

  for (const t of txns) {
    if (t.is_internal || !inMonth(t.txn_date, month)) continue;

    const splits = t.id ? splitsByParentId?.get(t.id) : undefined;
    if (splits && splits.length > 0) {
      for (const part of splits) {
        const amount = Number(part.amount);
        if (part.kind === "income") {
          actual_income += amount;
        } else if (
          expenseCountsTowardNet(
            {
              merchant: t.merchant,
              description: t.description,
              category: t.category,
              explicitExpenseType: part.expense_type,
            },
            rulesMap
          )
        ) {
          actual_expense += amount;
        }
      }
      continue;
    }

    const amount = Number(t.amount);
    if (t.kind === "income") {
      actual_income += amount;
    } else if (
      t.kind === "expense" &&
      expenseCountsTowardNet(
        {
          merchant: t.merchant,
          description: t.description,
          category: t.category,
          explicitExpenseType: t.expense_type,
        },
        rulesMap
      )
    ) {
      actual_expense += amount;
    }
  }

  return {
    actual_income: round2(actual_income),
    actual_expense: round2(actual_expense),
    net_actual: round2(actual_income - actual_expense),
  };
}

/** @deprecated Prefer monthNetFromTransactions — kept for simple row-only tests. */
export function monthNet(rows: NetRow[]): number {
  let net = 0;
  for (const row of rows) {
    const amount = Number(row.amount ?? 0);
    if (row.kind === "income") net += amount;
    else if (row.kind === "expense") net -= amount;
  }
  return round2(net);
}
