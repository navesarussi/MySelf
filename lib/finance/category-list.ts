import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { getSupabase } from "@/lib/supabase";

const MAX_CATEGORY_LEN = 40;

/** Trim and validate a user-supplied category name. */
export function normalizeCategory(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CATEGORY_LEN) return null;
  return trimmed;
}

/** Merge built-in defaults with categories seen in transactions, rules, and plan lines. */
export async function listFinanceCategories(): Promise<string[]> {
  const seen = new Set<string>(FINANCE_CATEGORIES);

  const [txnCats, ruleCats, planCats] = await Promise.all([
    getSupabase().from("finance_transactions").select("category").not("category", "is", null),
    getSupabase().from("finance_merchant_rules").select("category").not("category", "is", null),
    getSupabase().from("finance_plan_lines").select("category").not("category", "is", null),
  ]);

  for (const row of txnCats.data ?? []) {
    const cat = normalizeCategory(String((row as { category: string }).category));
    if (cat) seen.add(cat);
  }
  for (const row of ruleCats.data ?? []) {
    const cat = normalizeCategory(String((row as { category: string }).category));
    if (cat) seen.add(cat);
  }
  for (const row of planCats.data ?? []) {
    const cat = normalizeCategory(String((row as { category: string }).category));
    if (cat) seen.add(cat);
  }

  const builtins = [...FINANCE_CATEGORIES];
  const custom = [...seen].filter((c) => !(FINANCE_CATEGORIES as readonly string[]).includes(c)).sort();
  return [...builtins, ...custom];
}
