import { expenseTypeForCategory, quickCategoryOptions } from "@/lib/finance/categorize-client";
import { suggestCategoryFromHistory, type MerchantCategoryRow } from "@/lib/finance/merchant-category-client";
import {
  matchMerchantRule,
  resolveExpenseType,
  type ExpenseType,
  type MerchantRule,
} from "@/lib/finance/merchant-rules";
import type { FinanceTransaction } from "@/lib/finance/types";

export { expenseTypeForCategory, quickCategoryOptions } from "@/lib/finance/categorize-client";

export type TxnSuggestion = {
  suggested_category: string | null;
  suggested_expense_type: ExpenseType | null;
  default_note: string | null;
  has_merchant_rule: boolean;
};

export function suggestForTxn(
  txn: Pick<FinanceTransaction, "merchant" | "description" | "kind" | "category" | "needs_categorization" | "expense_type">,
  rulesMap: Map<string, MerchantRule>,
  history: MerchantCategoryRow[],
  rule?: MerchantRule | null
): TxnSuggestion {
  const matched = rule ?? matchMerchantRule(txn.merchant, txn.description, rulesMap);
  const suggested_category =
    txn.category ??
    matched?.category ??
    (txn.needs_categorization ? suggestCategoryFromHistory(txn.merchant, txn.description, history) : null);

  const suggested_expense_type =
    txn.expense_type ??
    matched?.expense_type ??
    (suggested_category && txn.kind === "expense"
      ? (resolveExpenseType({ category: suggested_category, kind: "expense", rule: matched }) as ExpenseType)
      : null);

  return {
    suggested_category,
    suggested_expense_type,
    default_note: matched?.default_note ?? null,
    has_merchant_rule: Boolean(matched?.category),
  };
}
