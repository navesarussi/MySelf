import { getSupabase } from "@/lib/supabase";
import type { WealthCategory, WealthItem, WealthSource, WealthSummary } from "@/lib/finance/wealth-types";
import { round2 } from "@/lib/finance/money";
import { matchExistingWealthItem } from "@/lib/finance/wealth-match";

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

export type WealthImportDraft = {
  category: WealthCategory;
  name: string;
  provider?: string | null;
  balance: number;
  notes?: string | null;
  source: WealthSource;
  as_of_date?: string | null;
};

export type WealthImportResult = { items: WealthItem[]; created: number; updated: number };

/**
 * Import a wealth snapshot (pasted Cover / הר הביטוח text, a screenshot the
 * agent read).
 *
 * This used to call `upsertWealthItem` without an id, which always inserts. The
 * parser deduplicates within one paste, but nothing deduplicated across pastes
 * and the table has no unique constraint — so importing the same snapshot
 * twice, or the agent retrying after a timeout, silently doubled the reported
 * net worth. A snapshot re-import refreshes balances; only genuinely new lines
 * are created.
 */
export async function importWealthItems(items: WealthImportDraft[]): Promise<WealthImportResult> {
  const existing = await listWealthItems();
  const results: WealthItem[] = [];
  let created = 0;
  let updated = 0;
  // Sequential so two lines of the same paste that resolve to one row (the
  // parser can emit both "קרן - מנורה" and "קרן — מנורה") update it in order
  // rather than racing to create two.
  for (const item of items) {
    const match = matchExistingWealthItem([...existing, ...results], item);
    const saved = await upsertWealthItem(match ? { ...item, id: match.id } : item);
    if (match) updated += 1;
    else created += 1;
    results.push(saved);
  }
  return { items: results, created, updated };
}
