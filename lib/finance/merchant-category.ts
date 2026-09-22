import { getSupabase } from "@/lib/supabase";
import {
  normalizeMerchantKey,
  suggestCategoryFromHistory,
  type MerchantCategoryRow,
} from "@/lib/finance/merchant-category-client";

export {
  normalizeMerchantKey,
  suggestCategoryFromHistory,
  type MerchantCategoryRow,
} from "@/lib/finance/merchant-category-client";

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
