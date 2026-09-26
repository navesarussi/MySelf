import { getSupabase } from "@/lib/supabase";
import { financeExternalKey } from "@/lib/finance/external-key";
import { rowToTxn } from "@/lib/finance/ingest";
import { applyMoneyItemType, type MoneyItemType } from "@/lib/finance/money-item-type";
import { formatMerchantLabel } from "@/lib/finance/merchant-rules-client";
import { round2 } from "@/lib/finance/money";
import { upsertMerchantRule } from "@/lib/finance/merchant-rules";
import type { FinanceTransaction } from "@/lib/finance/types";

export type ManualTxnInput = {
  txn_date: string;
  amount: number;
  item_type: MoneyItemType;
  category?: string | null;
  merchant?: string | null;
  description?: string | null;
  purpose_note?: string | null;
  txn_time?: string | null;
  remember_rule?: boolean;
  /** When true, also create/update a fixed merchant rule (recurring). */
  recurring?: boolean;
  planned_amount?: number;
  charge_day?: number | null;
  frequency?: "monthly" | "weekly" | "yearly";
};

export async function createManualTransaction(input: ManualTxnInput): Promise<FinanceTransaction> {
  const amount = round2(Math.abs(Number(input.amount)));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.txn_date)) throw new Error("invalid_txn_date");

  const fields = applyMoneyItemType(input.item_type, { kind: "expense" });
  const merchant = input.merchant?.trim() ? formatMerchantLabel(input.merchant) : null;
  const description = input.description?.trim() || merchant || "תנועה ידנית";
  const now = new Date().toISOString();
  const external_key = financeExternalKey({
    source: "manual",
    txn_date: input.txn_date,
    amount,
    description,
    merchant,
    identifier: `manual-${now}`,
  });

  const row = {
    source: "manual",
    external_key,
    txn_date: input.txn_date,
    amount,
    kind: fields.kind,
    currency: "ILS",
    amount_ils: amount,
    description,
    merchant,
    status: "completed",
    category: input.category ?? null,
    purpose_note: input.purpose_note ?? null,
    expense_type: fields.expense_type,
    txn_time: input.txn_time ?? null,
    is_internal: fields.is_internal,
    needs_categorization: !input.category,
    categorized_at: input.category ? now : null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await getSupabase().from("finance_transactions").insert(row).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("insert_failed");

  if (input.recurring && input.item_type === "fixed" && merchant) {
    await upsertMerchantRule({
      merchant_key: merchant,
      display_name: merchant,
      category: input.category ?? null,
      expense_type: "fixed",
      kind: "expense",
      default_note: input.purpose_note ?? null,
      planned_amount: input.planned_amount ?? amount,
      charge_day: input.charge_day ?? null,
      frequency: input.frequency ?? "monthly",
      is_active: true,
    });
  } else if (input.remember_rule && merchant) {
    await upsertMerchantRule({
      merchant_key: merchant,
      category: input.category ?? null,
      expense_type: fields.expense_type,
      kind: fields.kind,
      default_note: input.purpose_note ?? null,
    });
  }

  return rowToTxn(data as Record<string, unknown>);
}
