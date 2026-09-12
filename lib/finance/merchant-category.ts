import { getSupabase } from "@/lib/supabase";

/** Normalize merchant/description for category lookup. */
export function normalizeMerchantKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type MerchantCategoryRow = {
  merchant: string | null;
  description: string;
  category: string;
};

/** Load recent categorized transactions for suggestion matching. */
export async function loadCategoryHistory(limit = 500): Promise<MerchantCategoryRow[]> {
  const { data } = await getSupabase()
    .from("finance_transactions")
    .select("merchant, description, category")
    .eq("needs_categorization", false)
    .not("category", "is", null)
    .order("categorized_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as MerchantCategoryRow[];
}

/** Pick the most recent category for a merchant from prior categorized txns. */
export function suggestCategoryFromHistory(
  merchant: string | null | undefined,
  description: string | null | undefined,
  history: MerchantCategoryRow[]
): string | null {
  const keys = new Set<string>();
  const m = normalizeMerchantKey(merchant);
  const d = normalizeMerchantKey(description);
  if (m) keys.add(m);
  if (d) keys.add(d);

  for (const row of history) {
    const rm = normalizeMerchantKey(row.merchant);
    const rd = normalizeMerchantKey(row.description);
    if ((rm && keys.has(rm)) || (rd && keys.has(rd))) {
      return row.category;
    }
  }
  return null;
}
