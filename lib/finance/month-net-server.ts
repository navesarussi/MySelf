import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/db/paginate";
import { rowToTxn } from "@/lib/finance/ingest";
import { fetchMerchantRulesMap } from "@/lib/finance/merchant-rules";
import {
  monthNetFromTransactions,
  type MonthNetSplit,
} from "@/lib/finance/month-net-core";
import { fetchTransactionsInRange, monthBounds } from "@/lib/finance/txn-range";

const MONTH_NET_TXN_COLUMNS =
  "id, txn_date, amount, kind, is_internal, merchant, description, category, expense_type";

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
