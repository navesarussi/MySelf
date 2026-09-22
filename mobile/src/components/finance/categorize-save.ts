import type { HomePayload } from "../../api/resources";
import { api } from "../../api/resources";
import type { ApiConfig } from "../../api/client";
import { queryClient, queryKeys, decFinanceUncategorizedInHome } from "../../query";
import { syncWidgetFromHomeCache } from "../../widget/sync-widget-snapshot";
import type { ExpenseTypeValue } from "./categorize-controls";
import type { FinanceTransaction } from "@/lib/finance/types";
import { expenseTypeForCategory } from "@/lib/finance/suggest-txn";

export type UncategorizedTxn = FinanceTransaction & {
  suggested_category?: string | null;
  suggested_expense_type?: ExpenseTypeValue | null;
  default_note?: string | null;
  has_merchant_rule?: boolean;
};

export async function saveCategorization(
  config: ApiConfig,
  txn: UncategorizedTxn,
  category: string,
  opts?: { rememberRule?: boolean; skip?: boolean }
): Promise<void> {
  const month = txn.txn_date.slice(0, 7);
  const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
  queryClient.setQueryData<HomePayload>(queryKeys.home, (old) => decFinanceUncategorizedInHome(old));

  try {
    if (opts?.skip) {
      await api.categorizeFinanceTransaction(config, txn.id, { skip: true });
    } else {
      await api.categorizeFinanceTransaction(config, txn.id, {
        category,
        purpose_note: txn.default_note ?? txn.purpose_note ?? null,
        expense_type:
          txn.kind === "expense"
            ? txn.suggested_expense_type ?? expenseTypeForCategory(category, txn.kind)
            : null,
        remember_rule: opts?.rememberRule ?? true,
        txn_date: txn.txn_date,
        txn_time: txn.txn_time ?? null,
      });
    }
  } catch (err) {
    if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
    throw err;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.financeCashflow(month) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.financeTransactions(month) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.financeUncategorized }),
    queryClient.invalidateQueries({ queryKey: queryKeys.financePlan(month) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.home }),
  ]);
  syncWidgetFromHomeCache(true);
}

export function nextUncategorizedId(currentId: string): string | null {
  const list = queryClient.getQueryData<UncategorizedTxn[]>(queryKeys.financeUncategorized) ?? [];
  const idx = list.findIndex((t) => t.id === currentId);
  if (idx < 0) return list[0]?.id ?? null;
  return list[idx + 1]?.id ?? null;
}
