import { getSupabase } from "@/lib/supabase";
import { chunk, fetchAllRows } from "@/lib/db/paginate";
import { matchMerchantRule, normalizeMerchantKey, type MerchantRule } from "@/lib/finance/merchant-rules-client";
import { applyMoneyItemType, type MoneyItemType } from "@/lib/finance/money-item-type";
import type { FinanceTxnKind } from "@/lib/finance/types";

const UPDATE_CHUNK = 200;

type TxnRow = {
  id: string;
  merchant: string | null;
  description: string | null;
  kind: FinanceTxnKind;
};

function matchesMerchant(row: TxnRow, merchant: string | null, description: string | null): boolean {
  const key = normalizeMerchantKey(merchant || description);
  if (!key) return false;
  const fakeRule: MerchantRule = { merchant_key: key, category: null, expense_type: null, kind: null, default_note: null };
  return matchMerchantRule(row.merchant, row.description, [fakeRule]) !== null;
}

/** Apply type/category patch to all transactions of the same merchant (past + future in DB). */
export async function applyTypeToMerchantTransactions(input: {
  merchant: string | null;
  description: string | null;
  excludeId?: string;
  itemType: MoneyItemType;
  category?: string | null;
  purpose_note?: string | null;
}): Promise<string[]> {
  const anchor = normalizeMerchantKey(input.merchant || input.description);
  if (!anchor) return [];

  const rows = await fetchAllRows<TxnRow>(async (from, to) =>
    getSupabase()
      .from("finance_transactions")
      .select("id, merchant, description, kind")
      .is("deleted_at", null)
      .order("id")
      .range(from, to)
  );

  const matches = rows.filter(
    (r) => r.id !== input.excludeId && matchesMerchant(r, input.merchant, input.description)
  );
  if (matches.length === 0) return [];

  const now = new Date().toISOString();
  const applied: string[] = [];

  for (const batch of chunk(matches, UPDATE_CHUNK)) {
    for (const row of batch) {
      const fields = applyMoneyItemType(input.itemType, row);
      const patch: Record<string, unknown> = {
        ...fields,
        needs_categorization: false,
        categorized_at: now,
        updated_at: now,
      };
      if (input.category !== undefined) patch.category = input.category;
      if (input.purpose_note !== undefined) patch.purpose_note = input.purpose_note;

      const { error } = await getSupabase().from("finance_transactions").update(patch).eq("id", row.id);
      if (error) throw new Error(error.message);
      applied.push(row.id);
    }
  }
  return applied;
}
