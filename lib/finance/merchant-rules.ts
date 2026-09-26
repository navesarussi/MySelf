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

export type MerchantRuleInput = {
  merchant_key: string;
  display_name?: string | null;
  category?: string | null;
  expense_type?: ExpenseType | null;
  kind?: MerchantRuleKind | null;
  default_note?: string | null;
  planned_amount?: number | null;
  charge_day?: number | null;
  frequency?: "monthly" | "weekly" | "yearly" | null;
  is_active?: boolean;
};

export async function upsertMerchantRule(input: MerchantRuleInput): Promise<MerchantRule | null> {
  const key = normalizeMerchantKey(input.merchant_key);
  if (!key) return null;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    merchant_key: key,
    category: input.category ?? null,
    expense_type: input.expense_type ?? null,
    kind: input.kind ?? null,
    default_note: input.default_note ?? null,
    updated_at: now,
  };
  if (input.display_name !== undefined) row.display_name = input.display_name?.trim() || null;
  if (input.planned_amount !== undefined) row.planned_amount = input.planned_amount;
  if (input.charge_day !== undefined) row.charge_day = input.charge_day;
  if (input.frequency !== undefined) row.frequency = input.frequency;
  if (input.is_active !== undefined) row.is_active = input.is_active;

  const { data, error } = await getSupabase()
    .from("finance_merchant_rules")
    .upsert(row, { onConflict: "merchant_key" })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MerchantRule) ?? null;
}

export async function updateMerchantRuleById(
  id: string,
  patch: Partial<Omit<MerchantRuleInput, "merchant_key">> & { merchant_key?: string }
): Promise<MerchantRule> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.merchant_key !== undefined) {
    const key = normalizeMerchantKey(patch.merchant_key);
    if (!key) throw new Error("invalid_merchant_key");
    payload.merchant_key = key;
  }
  if (patch.display_name !== undefined) payload.display_name = patch.display_name?.trim() || null;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.expense_type !== undefined) payload.expense_type = patch.expense_type;
  if (patch.kind !== undefined) payload.kind = patch.kind;
  if (patch.default_note !== undefined) payload.default_note = patch.default_note;
  if (patch.planned_amount !== undefined) payload.planned_amount = patch.planned_amount;
  if (patch.charge_day !== undefined) payload.charge_day = patch.charge_day;
  if (patch.frequency !== undefined) payload.frequency = patch.frequency;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;

  const { data, error } = await getSupabase()
    .from("finance_merchant_rules")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_found");
  return data as MerchantRule;
}

export async function deleteMerchantRule(id: string): Promise<void> {
  const { error } = await getSupabase().from("finance_merchant_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
