import { getSupabase } from "@/lib/supabase";
import { chunk } from "@/lib/db/paginate";
import { applyMoneyItemType, type MoneyItemType } from "@/lib/finance/money-item-type";
import { softDeleteTransaction } from "@/lib/finance/split-txn";
import type { FinanceTxnKind } from "@/lib/finance/types";

export type BulkPatch = {
  ids: string[];
  category?: string | null;
  item_type?: MoneyItemType;
  is_internal?: boolean;
  delete?: boolean;
};

const UPDATE_CHUNK = 200;

export async function bulkEditTransactions(patch: BulkPatch): Promise<{ updated: string[]; deleted: string[] }> {
  const ids = [...new Set(patch.ids.filter(Boolean))];
  if (ids.length === 0) return { updated: [], deleted: [] };

  if (patch.delete) {
    const deleted: string[] = [];
    for (const id of ids) {
      const row = await softDeleteTransaction(id);
      if (row?.txn) deleted.push(id);
    }
    return { updated: [], deleted };
  }

  const now = new Date().toISOString();
  const base: Record<string, unknown> = {
    needs_categorization: false,
    categorized_at: now,
    updated_at: now,
  };
  if (patch.category !== undefined) base.category = patch.category;
  if (patch.is_internal !== undefined) base.is_internal = patch.is_internal;

  if (patch.item_type) {
    const { data: kinds } = await getSupabase().from("finance_transactions").select("id, kind").in("id", ids);
    const kindById = new Map((kinds ?? []).map((r) => [String(r.id), r.kind as FinanceTxnKind]));
    const updated: string[] = [];
    for (const id of ids) {
      const fields = applyMoneyItemType(patch.item_type, { kind: kindById.get(id) ?? "expense" });
      const { error } = await getSupabase()
        .from("finance_transactions")
        .update({ ...base, ...fields })
        .eq("id", id)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      updated.push(id);
    }
    return { updated, deleted: [] };
  }

  const updated: string[] = [];
  for (const batch of chunk(ids, UPDATE_CHUNK)) {
    const { error } = await getSupabase()
      .from("finance_transactions")
      .update(base)
      .in("id", batch)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    updated.push(...batch);
  }
  return { updated, deleted: [] };
}
