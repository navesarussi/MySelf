import { extractCoreMerchantName } from "@/lib/finance/cal-duplicate";
import { lineTypeForCategory, type PlanLineType } from "@/lib/finance/expense-type";
import { normalizeHebrewDescription } from "@/lib/finance/hebrew-merchant";

export type ExpenseType = "fixed" | "variable" | "savings";
export type MerchantRuleKind = "income" | "expense";

export type FixedExpenseFrequency = "monthly" | "weekly" | "yearly";

export type MerchantRule = {
  id?: string;
  merchant_key: string;
  display_name?: string | null;
  category: string | null;
  expense_type: ExpenseType | null;
  kind: MerchantRuleKind | null;
  default_note: string | null;
  planned_amount?: number | null;
  charge_day?: number | null;
  frequency?: FixedExpenseFrequency | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

/** Readable merchant label for UI (Hebrew spacing preserved). */
export function formatMerchantLabel(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return normalizeHebrewDescription(raw);
}

/** Legacy key before category-glue stripping (kept for existing finance_merchant_rules). */
export function legacyNormalizeMerchantKey(value: string | null | undefined): string {
  const spaced = formatMerchantLabel(value);
  return spaced.toLowerCase().replace(/\s+/g, " ");
}

/** Normalize merchant/description for consistent lookup and rule keys. */
export function normalizeMerchantKey(value: string | null | undefined): string {
  const spaced = formatMerchantLabel(value);
  const core = extractCoreMerchantName(spaced);
  if (core) return core;
  return legacyNormalizeMerchantKey(spaced);
}

function merchantLookupKeys(merchant: string | null | undefined, description: string | null | undefined): string[] {
  const keys = new Set<string>();
  for (const raw of [merchant, description]) {
    if (!raw?.trim()) continue;
    const modern = normalizeMerchantKey(raw);
    const legacy = legacyNormalizeMerchantKey(raw);
    if (modern) keys.add(modern);
    if (legacy) keys.add(legacy);
  }
  return [...keys];
}

/** Find a matching rule for a given merchant/description. */
export function matchMerchantRule<T extends { merchant_key: string }>(
  merchant: string | null | undefined,
  description: string | null | undefined,
  rules: Map<string, T> | T[]
): T | null {
  const keys = merchantLookupKeys(merchant, description);
  if (rules instanceof Map) {
    for (const k of keys) {
      if (rules.has(k)) return rules.get(k)!;
    }
    return null;
  }
  for (const k of keys) {
    for (const r of rules) {
      const ruleKeys = merchantLookupKeys(r.merchant_key, r.merchant_key);
      if (ruleKeys.includes(k)) return r;
    }
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
