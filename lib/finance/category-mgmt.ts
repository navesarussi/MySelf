import { getSupabase } from "@/lib/supabase";
import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { normalizeCategory } from "@/lib/finance/category-list";
import type { MoneyItemType } from "@/lib/finance/money-item-type";

export type CategoryMeta = {
  name: string;
  default_type: MoneyItemType | null;
  weekly_budget: number | null;
  is_builtin: boolean;
};

export async function fetchCategoryMeta(): Promise<Map<string, CategoryMeta>> {
  const { data, error } = await getSupabase().from("finance_categories").select("*");
  if (error && !error.message.includes("does not exist")) throw new Error(error.message);

  const map = new Map<string, CategoryMeta>();
  for (const row of data ?? []) {
    const name = String(row.name);
    map.set(name, {
      name,
      default_type: parseDefaultType(row.default_type),
      weekly_budget: row.weekly_budget != null ? Number(row.weekly_budget) : null,
      is_builtin: (FINANCE_CATEGORIES as readonly string[]).includes(name),
    });
  }
  return map;
}

function parseDefaultType(raw: unknown): MoneyItemType | null {
  if (raw === "fixed" || raw === "variable" || raw === "income" || raw === "internal") return raw;
  if (raw === "savings") return "variable";
  return null;
}

export async function upsertCategoryMeta(input: {
  name: string;
  default_type?: MoneyItemType | null;
  weekly_budget?: number | null;
}): Promise<CategoryMeta> {
  const name = normalizeCategory(input.name);
  if (!name) throw new Error("invalid_category");
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { name, updated_at: now };
  if (input.default_type !== undefined) row.default_type = input.default_type;
  if (input.weekly_budget !== undefined) row.weekly_budget = input.weekly_budget;

  const { data, error } = await getSupabase()
    .from("finance_categories")
    .upsert(row, { onConflict: "name" })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    name,
    default_type: parseDefaultType(data?.default_type),
    weekly_budget: data?.weekly_budget != null ? Number(data.weekly_budget) : null,
    is_builtin: (FINANCE_CATEGORIES as readonly string[]).includes(name),
  };
}

/** Rename category across transactions, rules, plan lines, and metadata. */
export async function renameCategory(from: string, to: string): Promise<void> {
  const oldName = normalizeCategory(from);
  const newName = normalizeCategory(to);
  if (!oldName || !newName || oldName === newName) throw new Error("invalid_rename");

  const now = new Date().toISOString();
  const tables = [
    { table: "finance_transactions", col: "category" },
    { table: "finance_merchant_rules", col: "category" },
    { table: "finance_plan_lines", col: "category" },
    { table: "finance_transaction_splits", col: "category" },
  ] as const;

  for (const { table, col } of tables) {
    const { error } = await getSupabase().from(table).update({ [col]: newName }).eq(col, oldName);
    if (error && !error.message.includes("does not exist")) throw new Error(error.message);
  }

  const { data: existing } = await getSupabase().from("finance_categories").select("*").eq("name", oldName).maybeSingle();
  if (existing) {
    await getSupabase().from("finance_categories").delete().eq("name", oldName);
    await upsertCategoryMeta({
      name: newName,
      default_type: parseDefaultType(existing.default_type),
      weekly_budget: existing.weekly_budget != null ? Number(existing.weekly_budget) : null,
    });
  }
}

/** Merge source category into target; reassign all references. */
export async function mergeCategories(source: string, target: string): Promise<void> {
  await renameCategory(source, target);
}
