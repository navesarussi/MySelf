import { getSupabase } from "@/lib/supabase";
import { normalizeCategory } from "@/lib/finance/category-list";
import { applyTypeToMerchantTransactions } from "@/lib/finance/apply-type-merchant";
import { applyRuleToPending } from "@/lib/finance/apply-rule-pending";
import { rowToTxn } from "@/lib/finance/ingest";
import { resolveExpenseType, upsertMerchantRule, type ExpenseType } from "@/lib/finance/merchant-rules";
import { formatMerchantLabel } from "@/lib/finance/merchant-rules-client";
import { applyMoneyItemType, type MoneyItemType } from "@/lib/finance/money-item-type";
import { round2 } from "@/lib/finance/money";
import { parseTxnTime } from "@/lib/finance/txn-datetime";
import type { FinanceTransaction } from "@/lib/finance/types";

export type TxnUpdateInput = {
  category?: string | null;
  purpose_note?: string | null;
  expense_type?: ExpenseType | null;
  item_type?: MoneyItemType;
  kind?: "income" | "expense";
  remember_rule?: boolean;
  apply_to_all?: boolean;
  amount?: number;
  merchant?: string | null;
  description?: string | null;
  txn_date?: string;
  txn_time?: string | null;
  is_internal?: boolean;
  skip?: boolean;
};

function parseExpenseType(raw: string, fallback: ExpenseType | null): ExpenseType | null {
  if (raw === "fixed" || raw === "variable" || raw === "savings") return raw;
  return fallback;
}

export async function updateFinanceTransaction(
  id: string,
  body: TxnUpdateInput
): Promise<FinanceTransaction & { applied_ids?: string[]; merchant_applied_ids?: string[] }> {
  const { data: existing, error: fetchErr } = await getSupabase()
    .from("finance_transactions")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("not_found");

  const current = rowToTxn(existing as Record<string, unknown>);
  const now = new Date().toISOString();

  if (body.skip) {
    const { data, error } = await getSupabase()
      .from("finance_transactions")
      .update({ needs_categorization: false, updated_at: now })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return rowToTxn(data as Record<string, unknown>);
  }

  const hasCategoryField = body.category !== undefined;
  let category = hasCategoryField
    ? body.category === null
      ? null
      : normalizeCategory(String(body.category))
    : current.category;
  if (hasCategoryField && body.category !== null && String(body.category) && !category) {
    throw new Error("invalid_category");
  }

  const isCategorize = current.needs_categorization || hasCategoryField;
  if (isCategorize && !category) throw new Error("category_required");

  const purpose_note = body.purpose_note !== undefined ? body.purpose_note?.trim() || null : current.purpose_note;

  let kind = current.kind;
  if (body.kind === "income" || body.kind === "expense") kind = body.kind;

  let expense_type: ExpenseType | null = current.expense_type;
  let is_internal = current.is_internal;

  if (body.item_type) {
    const fields = applyMoneyItemType(body.item_type, { kind: current.kind });
    kind = fields.kind;
    expense_type = fields.expense_type;
    is_internal = fields.is_internal;
  } else if (body.is_internal !== undefined) {
    is_internal = Boolean(body.is_internal);
  }

  if (body.expense_type !== undefined && kind === "expense" && !body.item_type) {
    expense_type = parseExpenseType(String(body.expense_type), expense_type);
  } else if (kind === "expense" && !body.item_type && body.expense_type === undefined) {
    expense_type =
      expense_type ??
      (resolveExpenseType({ category, kind: "expense" }) as ExpenseType);
  }
  if (kind === "income") expense_type = null;

  let txn_date = current.txn_date;
  if (body.txn_date !== undefined) {
    const d = String(body.txn_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("invalid_txn_date");
    txn_date = d;
  }

  let txn_time = current.txn_time ?? null;
  if (body.txn_time !== undefined) {
    if (body.txn_time === null || body.txn_time === "") txn_time = null;
    else {
      const parsed = parseTxnTime(body.txn_time);
      if (!parsed) throw new Error("invalid_txn_time");
      txn_time = parsed;
    }
  }

  let amount = current.amount;
  if (body.amount !== undefined) {
    const parsed = Number(body.amount);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("invalid_amount");
    amount = round2(parsed);
  }

  let merchant = current.merchant;
  if (body.merchant !== undefined) {
    const raw = body.merchant?.trim() || null;
    merchant = raw ? formatMerchantLabel(raw) : null;
  }

  let description = current.description;
  if (body.description !== undefined) {
    description = body.description?.trim() || current.description;
  }

  let savedRule = null;
  if (body.remember_rule) {
    const merchantKey = merchant || description;
    if (merchantKey) {
      savedRule = await upsertMerchantRule({
        merchant_key: merchantKey,
        category,
        expense_type,
        kind,
        default_note: purpose_note,
      });
    }
  }

  const patch: Record<string, unknown> = {
    category,
    purpose_note,
    expense_type,
    kind,
    txn_date,
    txn_time,
    amount,
    merchant,
    description,
    is_internal,
    needs_categorization: false,
    categorized_at: current.categorized_at || now,
    updated_at: now,
  };

  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_found");

  let applied_ids: string[] = [];
  if (savedRule) {
    applied_ids = await applyRuleToPending(savedRule, id).catch(() => []);
  }

  let merchant_applied_ids: string[] = [];
  if (body.apply_to_all && body.item_type) {
    merchant_applied_ids = await applyTypeToMerchantTransactions({
      merchant,
      description,
      excludeId: id,
      itemType: body.item_type,
      category,
      purpose_note,
    }).catch(() => []);
  }

  return { ...rowToTxn(data as Record<string, unknown>), applied_ids, merchant_applied_ids };
}
