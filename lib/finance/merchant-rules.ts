import { getSupabase } from "@/lib/supabase";
import {
  legacyNormalizeMerchantKey,
  normalizeMerchantKey,
  type ExpenseType,
  type MerchantRule,
  type MerchantRuleKind,
} from "@/lib/finance/merchant-rules-client";

export {
  matchMerchantRule,
  normalizeMerchantKey,
  resolveExpenseType,
  type ExpenseType,
  type MerchantRule,
  type MerchantRuleKind,
} from "@/lib/finance/merchant-rules-client";

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
    const modern = normalizeMerchantKey(r.merchant_key);
    const legacy = legacyNormalizeMerchantKey(r.merchant_key);
    if (modern) map.set(modern, r);
    if (legacy && legacy !== modern) map.set(legacy, r);
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
