import type { HomePayload } from "../../api/resources";
import { api } from "../../api/resources";
import type { ApiConfig } from "../../api/client";
import { queryClient, queryKeys, decFinanceUncategorizedInHome } from "../../query";
import type { ExpenseTypeValue } from "./categorize-controls";
import type { FinanceTransaction } from "@/lib/finance/types";
import { expenseTypeForCategory } from "@/lib/finance/categorize-client";

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
      const saved = await api.categorizeFinanceTransaction(config, txn.id, {
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
      dropSettledFromQueue(saved.applied_ids);
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
}

/** The rule also settled other pending rows from this merchant. Drop them from
 *  the cached queue now so "next" never lands on one — the list query may be
 *  inactive, in which case invalidation alone would not refetch it. */
function dropSettledFromQueue(ids: string[] | undefined): void {
  if (!ids?.length) return;
  const settled = new Set(ids);
  queryClient.setQueryData<UncategorizedTxn[]>(queryKeys.financeUncategorized, (old) =>
    old ? old.filter((t) => !settled.has(t.id)) : old
  );
}

export function nextUncategorizedId(currentId: string): string | null {
  const list = queryClient.getQueryData<UncategorizedTxn[]>(queryKeys.financeUncategorized) ?? [];
  const idx = list.findIndex((t) => t.id === currentId);
  if (idx < 0) return list[0]?.id ?? null;
  return list[idx + 1]?.id ?? null;
}
