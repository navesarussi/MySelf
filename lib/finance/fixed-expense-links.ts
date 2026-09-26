import { getSupabase } from "@/lib/supabase";
import { recurringMerchantGroupKey } from "@/lib/finance/cal-duplicate";
import { normalizeMerchantKey } from "@/lib/finance/merchant-rules-client";
import type { FinanceTransaction } from "@/lib/finance/types";

export type MatchedTxn = Pick<
  FinanceTransaction,
  "id" | "txn_date" | "amount" | "merchant" | "description" | "purpose_note"
>;

export async function fetchUnlinkedTxnIds(merchantKey: string): Promise<Set<string>> {
  try {
    const { data, error } = await getSupabase()
      .from("finance_fixed_expense_unlinks")
      .select("txn_id")
      .eq("merchant_key", merchantKey);
    if (error) return new Set();
    return new Set((data ?? []).map((r) => String(r.txn_id)));
  } catch {
    return new Set();
  }
}

export function txnMatchesFixedKey(t: FinanceTransaction, key: string, unlinked: Set<string>): boolean {
  if (unlinked.has(t.id)) return false;
  if (t.kind !== "expense" || t.is_internal) return false;
  const groupKey = recurringMerchantGroupKey(t);
  return groupKey === key || normalizeMerchantKey(t.merchant) === key || normalizeMerchantKey(t.description) === key;
}

export async function unlinkTxnFromFixed(ruleId: string | null, merchantKey: string, txnId: string): Promise<void> {
  const { error } = await getSupabase().from("finance_fixed_expense_unlinks").upsert(
    { rule_id: ruleId, merchant_key: merchantKey, txn_id: txnId },
    { onConflict: "txn_id,merchant_key" }
  );
  if (error) throw new Error(error.message);
}

export async function linkTxnToFixed(merchantKey: string, txnId: string): Promise<void> {
  const { error } = await getSupabase()
    .from("finance_fixed_expense_unlinks")
    .delete()
    .eq("txn_id", txnId)
    .eq("merchant_key", merchantKey);
  if (error) throw new Error(error.message);
}

export function matchedTxnsForFixed(
  merchantKey: string,
  month: string,
  monthTxns: FinanceTransaction[],
  unlinked: Set<string>
): MatchedTxn[] {
  return monthTxns
    .filter((t) => t.txn_date.startsWith(month) && txnMatchesFixedKey(t, merchantKey, unlinked))
    .map((t) => ({
      id: t.id,
      txn_date: t.txn_date,
      amount: t.amount,
      merchant: t.merchant,
      description: t.description,
      purpose_note: t.purpose_note,
    }))
    .sort((a, b) => b.txn_date.localeCompare(a.txn_date));
}
