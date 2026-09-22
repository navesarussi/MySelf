import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { lineTypeForCategory } from "@/lib/finance/expense-type";
import type { ExpenseType } from "@/lib/finance/merchant-rules-client";
import type { FinanceTransaction } from "@/lib/finance/types";

/** Compact chip list: suggestion first, then common categories, then user categories. */
export function quickCategoryOptions(
  suggested: string | null,
  userCategories: string[],
  limit = 8
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (cat: string | null | undefined) => {
    const v = cat?.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  add(suggested);
  for (const cat of FINANCE_CATEGORIES) add(cat);
  for (const cat of userCategories) add(cat);
  return out.slice(0, limit);
}

export function expenseTypeForCategory(
  category: string,
  kind: FinanceTransaction["kind"],
  fallback: ExpenseType | null = "variable"
): ExpenseType | null {
  if (kind !== "expense") return null;
  const resolved = lineTypeForCategory(category, "expense");
  if (resolved === "fixed" || resolved === "variable" || resolved === "savings") return resolved;
  return fallback;
}
