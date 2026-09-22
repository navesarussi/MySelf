import { lineTypeForCategory, type PlanLineType } from "@/lib/finance/expense-type";

export type ExpenseType = "fixed" | "variable" | "savings";
export type MerchantRuleKind = "income" | "expense";

export type MerchantRule = {
  id?: string;
  merchant_key: string;
  category: string | null;
  expense_type: ExpenseType | null;
  kind: MerchantRuleKind | null;
  default_note: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Normalize merchant/description for consistent lookup and rule keys. */
export function normalizeMerchantKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Find a matching rule for a given merchant/description. */
export function matchMerchantRule<T extends { merchant_key: string }>(
  merchant: string | null | undefined,
  description: string | null | undefined,
  rules: Map<string, T> | T[]
): T | null {
  const m = normalizeMerchantKey(merchant);
  const d = normalizeMerchantKey(description);
  if (rules instanceof Map) {
    if (m && rules.has(m)) return rules.get(m)!;
    if (d && rules.has(d)) return rules.get(d)!;
    return null;
  }
  for (const r of rules) {
    const k = normalizeMerchantKey(r.merchant_key);
    if ((m && k === m) || (d && k === d)) return r;
  }
  return null;
}

/** Resolve expense type: explicit -> matched rule -> category default. */
export function resolveExpenseType(input: {
  merchant?: string | null;
  description?: string | null;
  category?: string | null;
  kind?: "income" | "expense";
  explicitExpenseType?: ExpenseType | null;
  rules?: Map<string, MerchantRule> | MerchantRule[];
  rule?: Pick<MerchantRule, "expense_type"> | null;
}): PlanLineType {
  if (input.kind === "income") return "income";

  if (
    input.explicitExpenseType === "fixed" ||
    input.explicitExpenseType === "variable" ||
    input.explicitExpenseType === "savings"
  ) {
    return input.explicitExpenseType;
  }

  const directRule = input.rule;
  if (
    directRule?.expense_type === "fixed" ||
    directRule?.expense_type === "variable" ||
    directRule?.expense_type === "savings"
  ) {
    return directRule.expense_type;
  }

  if (input.rules) {
    const matched = matchMerchantRule(input.merchant, input.description, input.rules);
    if (
      matched?.expense_type === "fixed" ||
      matched?.expense_type === "variable" ||
      matched?.expense_type === "savings"
    ) {
      return matched.expense_type;
    }
  }

  return lineTypeForCategory(input.category, "expense");
}
