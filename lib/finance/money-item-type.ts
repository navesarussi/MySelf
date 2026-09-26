import type { ExpenseType } from "@/lib/finance/merchant-rules-client";
import type { FinanceTransaction, FinanceTxnKind } from "@/lib/finance/types";

/** Unified money-item type for UI and API. */
export type MoneyItemType = "fixed" | "variable" | "income" | "internal";

export function moneyItemTypeFromTxn(t: Pick<FinanceTransaction, "kind" | "expense_type" | "is_internal">): MoneyItemType {
  if (t.is_internal) return "internal";
  if (t.kind === "income") return "income";
  if (t.expense_type === "fixed") return "fixed";
  return "variable";
}

export function moneyItemTypeToFields(type: MoneyItemType): {
  kind: FinanceTxnKind;
  expense_type: ExpenseType | null;
  is_internal: boolean;
} {
  switch (type) {
    case "income":
      return { kind: "income", expense_type: null, is_internal: false };
    case "internal":
      return { kind: "expense", expense_type: null, is_internal: true };
    case "fixed":
      return { kind: "expense", expense_type: "fixed", is_internal: false };
    case "variable":
    default:
      return { kind: "expense", expense_type: "variable", is_internal: false };
  }
}

/** Preserve income/expense when switching to internal only. */
export function applyMoneyItemType(
  type: MoneyItemType,
  current: Pick<FinanceTransaction, "kind">
): { kind: FinanceTxnKind; expense_type: ExpenseType | null; is_internal: boolean } {
  if (type === "internal") {
    return { kind: current.kind, expense_type: null, is_internal: true };
  }
  return moneyItemTypeToFields(type);
}
