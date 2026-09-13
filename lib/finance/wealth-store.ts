import { getSupabase } from "@/lib/supabase";
import type { WealthCategory, WealthItem, WealthSource, WealthSummary } from "@/lib/finance/wealth-types";

const CATEGORIES: WealthCategory[] = ["pension", "insurance", "investment", "property", "other"];

function rowToItem(row: Record<string, unknown>): WealthItem {
  return {
    id: String(row.id),
    category: row.category as WealthCategory,
    name: String(row.name),
    provider: row.provider != null ? String(row.provider) : null,
    balance: Number(row.balance),
    currency: String(row.currency ?? "ILS"),
    notes: row.notes != null ? String(row.notes) : null,
    source: row.source as WealthSource,
    as_of_date: row.as_of_date != null ? String(row.as_of_date) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listWealthItems(): Promise<WealthItem[]> {
  const { data, error } = await getSupabase()
    .from("finance_wealth_items")
    .select("*")
    .order("category")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToItem(r as Record<string, unknown>));
}

export function summarizeWealth(items: WealthItem[]): WealthSummary {
  const by_category = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<WealthCategory, number>;
  let total = 0;
  for (const item of items) {
    by_category[item.category] = (by_category[item.category] ?? 0) + item.balance;
    total += item.balance;
  }
  return { total: round2(total), by_category, items };
}

export async function getWealthSummary(): Promise<WealthSummary> {
  const items = await listWealthItems();
  return summarizeWealth(items);
}

export async function upsertWealthItem(input: {
  id?: string;
  category: WealthCategory;
  name: string;
  provider?: string | null;
  balance: number;
  currency?: string;
  notes?: string | null;
  source?: WealthSource;
  as_of_date?: string | null;
}): Promise<WealthItem> {
  const now = new Date().toISOString();
  const payload = {
    category: input.category,
    name: input.name.trim(),
    provider: input.provider?.trim() || null,
    balance: Math.max(0, input.balance),
    currency: input.currency ?? "ILS",
    notes: input.notes ?? null,
    source: input.source ?? "manual",
    as_of_date: input.as_of_date ?? null,
    updated_at: now,
  };

  if (input.id) {
    const { data, error } = await getSupabase()
      .from("finance_wealth_items")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return rowToItem(data as Record<string, unknown>);
  }

  const { data, error } = await getSupabase()
    .from("finance_wealth_items")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "create_failed");
  return rowToItem(data as Record<string, unknown>);
}

export async function deleteWealthItem(id: string): Promise<void> {
  const { error } = await getSupabase().from("finance_wealth_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function bulkUpsertWealthItems(
  items: Array<{
    category: WealthCategory;
    name: string;
    provider?: string | null;
    balance: number;
    notes?: string | null;
    source: WealthSource;
    as_of_date?: string | null;
  }>
): Promise<WealthItem[]> {
  const results: WealthItem[] = [];
  for (const item of items) {
    results.push(await upsertWealthItem(item));
  }
  return results;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
