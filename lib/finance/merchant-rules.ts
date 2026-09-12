import { getSupabase } from "@/lib/supabase";
import { lineTypeForCategory, type PlanLineType } from "@/lib/finance/expense-type";

export type ExpenseType = "fixed" | "variable";
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

  if (input.explicitExpenseType === "fixed" || input.explicitExpenseType === "variable") {
    return input.explicitExpenseType;
  }

  const directRule = input.rule;
  if (directRule?.expense_type === "fixed" || directRule?.expense_type === "variable") {
    return directRule.expense_type;
  }

  if (input.rules) {
    const matched = matchMerchantRule(input.merchant, input.description, input.rules);
    if (matched?.expense_type === "fixed" || matched?.expense_type === "variable") {
      return matched.expense_type;
    }
  }

  return lineTypeForCategory(input.category, "expense");
}

export async function fetchMerchantRules(): Promise<MerchantRule[]> {
  const { data, error } = await getSupabase()
    .from("finance_merchant_rules")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MerchantRule[];
}

export async function fetchMerchantRulesMap(): Promise<Map<string, MerchantRule>> {
  const rules = await fetchMerchantRules();
  const map = new Map<string, MerchantRule>();
  for (const r of rules) {
    map.set(normalizeMerchantKey(r.merchant_key), r);
  }
  return map;
}

export async function findMerchantRule(
  merchant?: string | null,
  description?: string | null
): Promise<MerchantRule | null> {
  const m = normalizeMerchantKey(merchant);
  const d = normalizeMerchantKey(description);
  const keys = Array.from(new Set([m, d].filter(Boolean))) as string[];
  if (keys.length === 0) return null;

  const { data, error } = await getSupabase()
    .from("finance_merchant_rules")
    .select("*")
    .in("merchant_key", keys)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  return data[0] as MerchantRule;
}

export async function upsertMerchantRule(input: {
  merchant_key: string;
  category?: string | null;
  expense_type?: ExpenseType | null;
  kind?: MerchantRuleKind | null;
  default_note?: string | null;
}): Promise<MerchantRule | null> {
  const key = normalizeMerchantKey(input.merchant_key);
  if (!key) return null;
  const now = new Date().toISOString();
  const row = {
    merchant_key: key,
    category: input.category ?? null,
    expense_type: input.expense_type ?? null,
    kind: input.kind ?? null,
    default_note: input.default_note ?? null,
    updated_at: now,
  };
  const { data, error } = await getSupabase()
    .from("finance_merchant_rules")
    .upsert(row, { onConflict: "merchant_key" })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MerchantRule) ?? null;
}
