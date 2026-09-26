import { resolveExpenseType, type MerchantRule } from "@/lib/finance/merchant-rules-client";
import { round2 } from "@/lib/finance/money";
import type { FinanceTransaction } from "@/lib/finance/types";

export type VariableTxnItem = Pick<
  FinanceTransaction,
  | "id"
  | "txn_date"
  | "txn_time"
  | "merchant"
  | "merchant_display"
  | "description"
  | "amount"
  | "category"
  | "purpose_note"
  | "expense_type"
  | "kind"
  | "is_internal"
  | "needs_categorization"
  | "categorized_at"
  | "source"
>;

export type VariableCategoryGroup = {
  category: string;
  total: number;
  transactions: VariableTxnItem[];
};

function isVariableTxn(t: FinanceTransaction, rules?: Map<string, MerchantRule>): boolean {
  if (t.kind !== "expense" || t.is_internal) return false;
  const lineType = resolveExpenseType({
    merchant: t.merchant,
    description: t.description,
    category: t.category,
    kind: "expense",
    explicitExpenseType: t.expense_type,
    rules,
  });
  return lineType === "variable";
}

/** Group variable expenses by category for a month. */
export function buildVariableBreakdown(
  month: string,
  txns: FinanceTransaction[],
  rules?: Map<string, MerchantRule>
): VariableCategoryGroup[] {
  const byCategory = new Map<string, VariableTxnItem[]>();

  for (const t of txns) {
    if (!t.txn_date.startsWith(month) || !isVariableTxn(t, rules)) continue;
    const cat = t.category ?? "אחר";
    const list = byCategory.get(cat) ?? [];
    list.push({
      id: t.id,
      txn_date: t.txn_date,
      txn_time: t.txn_time ?? null,
      merchant: t.merchant,
      merchant_display: t.merchant_display,
      description: t.description,
      amount: t.amount,
      category: t.category,
      purpose_note: t.purpose_note,
      expense_type: t.expense_type,
      kind: t.kind,
      is_internal: t.is_internal,
      needs_categorization: t.needs_categorization,
      categorized_at: t.categorized_at,
      source: t.source,
    });
    byCategory.set(cat, list);
  }

  const groups: VariableCategoryGroup[] = [];
  for (const [category, transactions] of byCategory.entries()) {
    transactions.sort((a, b) => b.txn_date.localeCompare(a.txn_date) || (b.txn_time ?? "").localeCompare(a.txn_time ?? ""));
    groups.push({
      category,
      total: round2(transactions.reduce((s, t) => s + t.amount, 0)),
      transactions,
    });
  }

  return groups.sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, "he"));
}
