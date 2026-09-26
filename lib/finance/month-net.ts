import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/db/paginate";
import { rowToTxn } from "@/lib/finance/ingest";
import { round2 } from "@/lib/finance/money";
import {
  fetchMerchantRulesMap,
  resolveExpenseType,
  type MerchantRule,
} from "@/lib/finance/merchant-rules";
import { fetchTransactionsInRange, monthBounds } from "@/lib/finance/txn-range";
import type { ExpenseType } from "@/lib/finance/merchant-rules-client";

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

const MONTH_NET_TXN_COLUMNS =
  "id, txn_date, amount, kind, is_internal, merchant, description, category, expense_type";

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

export async function fetchSplitsByParentIds(parentIds: readonly string[]): Promise<Map<string, MonthNetSplit[]>> {
  const map = new Map<string, MonthNetSplit[]>();
  if (parentIds.length === 0) return map;

  const rows = await fetchAllRows<Record<string, unknown>>(async (from, to) => {
    const { data, error } = await getSupabase()
      .from("finance_transaction_splits")
      .select("parent_txn_id, amount, kind, expense_type")
      .in("parent_txn_id", [...parentIds])
      .order("parent_txn_id")
      .order("sort_order")
      .range(from, to);
    return { data, error };
  });

  for (const row of rows) {
    const parentId = String(row.parent_txn_id);
    const part: MonthNetSplit = {
      amount: Number(row.amount),
      kind: row.kind === "income" ? "income" : "expense",
      expense_type:
        row.expense_type === "fixed" || row.expense_type === "variable" || row.expense_type === "savings"
          ? row.expense_type
          : null,
    };
    const list = map.get(parentId) ?? [];
    list.push(part);
    map.set(parentId, list);
  }
  return map;
}

/**
 * Month net for dashboards (home KPI, widgets, agent context).
 * Uses the same rules as the Money tab plan hero.
 */
export async function fetchMonthNetActual(month: string): Promise<number> {
  const [rows, rulesMap] = await Promise.all([
    fetchTransactionsInRange(monthBounds(month), MONTH_NET_TXN_COLUMNS),
    fetchMerchantRulesMap(),
  ]);
  const txns = rows.map((row) => rowToTxn(row));
  const splitsByParentId = await fetchSplitsByParentIds(txns.map((t) => t.id));
  return monthNetFromTransactions(txns, month, rulesMap, splitsByParentId).net_actual;
}
