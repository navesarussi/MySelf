import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { lineTypeForCategory } from "@/lib/finance/expense-type";
import { suggestCategoryFromHistory, type MerchantCategoryRow } from "@/lib/finance/merchant-category";
import {
  findMerchantRule,
  matchMerchantRule,
  resolveExpenseType,
  type ExpenseType,
  type MerchantRule,
} from "@/lib/finance/merchant-rules";
import type { FinanceTransaction } from "@/lib/finance/types";

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

/** Compact chip list: suggestion first, then common categories, then user categories. */
export function quickCategoryOptions(
  suggested: string | null,
  userCategories: string[],
  limit = 8
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (cat: string | null | undefined) => {
    const v = cat?.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  add(suggested);
  for (const cat of FINANCE_CATEGORIES) add(cat);
  for (const cat of userCategories) add(cat);
  return out.slice(0, limit);
}

export function expenseTypeForCategory(
  category: string,
  kind: FinanceTransaction["kind"],
  fallback: ExpenseType | null = "variable"
): ExpenseType | null {
  if (kind !== "expense") return null;
  const resolved = lineTypeForCategory(category, "expense");
  if (resolved === "fixed" || resolved === "variable" || resolved === "savings") return resolved;
  return fallback;
}
