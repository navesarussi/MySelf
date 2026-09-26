import { getSupabase } from "@/lib/supabase";
import { round2 } from "@/lib/finance/money";
import { rowToTxn } from "@/lib/finance/ingest";
import type { FinanceTransaction } from "@/lib/finance/types";
import type { ExpenseType } from "@/lib/finance/merchant-rules-client";

export type SplitPart = {
  amount: number;
  category?: string | null;
  expense_type?: ExpenseType | null;
  kind?: "income" | "expense";
  note?: string | null;
};

export type SplitRow = SplitPart & { id: string; sort_order: number };

export async function fetchSplitsForTxn(parentId: string): Promise<SplitRow[]> {
  const { data, error } = await getSupabase()
    .from("finance_transaction_splits")
    .select("*")
    .eq("parent_txn_id", parentId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    amount: Number(r.amount),
    category: r.category != null ? String(r.category) : null,
    expense_type:
      r.expense_type === "fixed" || r.expense_type === "variable" || r.expense_type === "savings"
        ? r.expense_type
        : null,
    kind: r.kind === "income" ? "income" : "expense",
    note: r.note != null ? String(r.note) : null,
    sort_order: Number(r.sort_order ?? 0),
  }));
}

export function validateSplitParts(totalAmount: number, parts: SplitPart[]): string | null {
  if (parts.length < 2) return "split_requires_two_parts";
  let sum = 0;
  for (const p of parts) {
    const amt = Number(p.amount);
    if (!Number.isFinite(amt) || amt <= 0) return "invalid_split_amount";
    sum += amt;
  }
  if (round2(sum) !== round2(totalAmount)) return "split_amount_mismatch";
  return null;
}

/** Replace splits for a transaction; parent amount stays unchanged. */
export async function saveTransactionSplits(parentId: string, parts: SplitPart[]): Promise<SplitRow[]> {
  const { data: parent, error: pErr } = await getSupabase()
    .from("finance_transactions")
    .select("amount")
    .eq("id", parentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!parent) throw new Error("not_found");

  const err = validateSplitParts(Number(parent.amount), parts);
  if (err) throw new Error(err);

  const { error: delErr } = await getSupabase()
    .from("finance_transaction_splits")
    .delete()
    .eq("parent_txn_id", parentId);
  if (delErr) throw new Error(delErr.message);

  const rows = parts.map((p, i) => ({
    parent_txn_id: parentId,
    amount: round2(Number(p.amount)),
    category: p.category ?? null,
    expense_type: p.expense_type ?? null,
    kind: p.kind === "income" ? "income" : "expense",
    note: p.note ?? null,
    sort_order: i,
  }));

  const { data, error } = await getSupabase().from("finance_transaction_splits").insert(rows).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r, i) => ({
    id: String(r.id),
    amount: Number(r.amount),
    category: r.category != null ? String(r.category) : null,
    expense_type:
      r.expense_type === "fixed" || r.expense_type === "variable" || r.expense_type === "savings"
        ? r.expense_type
        : null,
    kind: r.kind === "income" ? "income" : "expense",
    note: r.note != null ? String(r.note) : null,
    sort_order: i,
  }));
}

export async function softDeleteTransaction(id: string): Promise<{ txn: FinanceTransaction; deleted_at: string } | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { txn: rowToTxn(data as Record<string, unknown>), deleted_at: now };
}

export async function restoreTransaction(id: string): Promise<FinanceTransaction | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .update({ deleted_at: null, updated_at: now })
    .eq("id", id)
    .not("deleted_at", "is", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToTxn(data as Record<string, unknown>) : null;
}
