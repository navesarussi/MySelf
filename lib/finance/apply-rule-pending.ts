import { getSupabase } from "@/lib/supabase";
import { chunk, fetchAllRows } from "@/lib/db/paginate";
import { matchMerchantRule, type MerchantRule } from "@/lib/finance/merchant-rules-client";

/**
 * Categorizing one transaction with "remember for this merchant" saves a rule,
 * but rules only ran at ingest — every other transaction from that merchant
 * already waiting in the queue stayed uncategorized, and the user was asked
 * about the same store again for each one (a bulk card import left 600+).
 * Saving a rule now settles the pending transactions it matches.
 */

export type PendingRow = {
  id: string;
  merchant: string | null;
  description: string | null;
  kind: string;
  purpose_note: string | null;
};

type RuleForPending = Pick<MerchantRule, "merchant_key" | "kind">;

/** Pending rows the rule covers: same merchant key, same kind (when the rule has one). */
export function pendingMatchesForRule(
  rows: readonly PendingRow[],
  rule: RuleForPending,
  excludeId?: string
): PendingRow[] {
  return rows.filter(
    (row) =>
      row.id !== excludeId &&
      (!rule.kind || row.kind === rule.kind) &&
      matchMerchantRule(row.merchant, row.description, [rule]) !== null
  );
}

const UPDATE_CHUNK = 200;

/** Apply a saved rule to every pending transaction it matches. Returns the ids it categorized. */
export async function applyRuleToPending(rule: MerchantRule, excludeId?: string): Promise<string[]> {
  if (!rule.category) return [];
  const supabase = getSupabase();
  const pending = await fetchAllRows<PendingRow>(async (from, to) =>
    supabase
      .from("finance_transactions")
      .select("id, merchant, description, kind, purpose_note")
      .eq("needs_categorization", true)
      .is("categorized_at", null)
      .eq("is_internal", false)
      .order("id")
      .range(from, to)
  );
  const matches = pendingMatchesForRule(pending, rule, excludeId);
  if (matches.length === 0) return [];

  const now = new Date().toISOString();
  const base = {
    category: rule.category,
    expense_type: rule.kind === "income" ? null : rule.expense_type,
    needs_categorization: false,
    categorized_at: now,
    updated_at: now,
  };
  // A row's own note wins over the rule's default, as at ingest.
  const withoutNote = matches.filter((m) => !m.purpose_note).map((m) => m.id);
  const withNote = matches.filter((m) => m.purpose_note).map((m) => m.id);
  const groups: [string[], Record<string, unknown>][] = [
    [withoutNote, rule.default_note ? { ...base, purpose_note: rule.default_note } : base],
    [withNote, base],
  ];

  const applied: string[] = [];
  for (const [ids, patch] of groups) {
    for (const batch of chunk(ids, UPDATE_CHUNK)) {
      const { error } = await supabase
        .from("finance_transactions")
        .update(patch)
        .in("id", batch)
        .eq("needs_categorization", true);
      if (error) throw new Error(error.message);
      applied.push(...batch);
    }
  }
  return applied;
}
