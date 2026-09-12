import { getSupabase } from "@/lib/supabase";
import { notifyUser } from "@/lib/push/notify";
import { financeExternalKey, type FinanceSource } from "@/lib/finance/external-key";

export type FinanceTxnKind = "income" | "expense";
export type FinanceTxnStatus = "pending" | "completed";

export type FinanceIngestInput = {
  source: FinanceSource;
  txn_date: string;
  amount: number;
  kind?: FinanceTxnKind;
  currency?: string;
  description?: string;
  merchant?: string | null;
  account_number?: string | null;
  card_name?: string | null;
  status?: FinanceTxnStatus;
  identifier?: string | number | null;
  external_key?: string;
  category?: string | null;
  purpose_note?: string | null;
  needs_categorization?: boolean;
};

export type FinanceTransaction = {
  id: string;
  source: FinanceSource;
  external_key: string;
  txn_date: string;
  amount: number;
  kind: FinanceTxnKind;
  currency: string;
  description: string;
  merchant: string | null;
  account_number: string | null;
  card_name: string | null;
  status: FinanceTxnStatus;
  category: string | null;
  purpose_note: string | null;
  needs_categorization: boolean;
  categorized_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToTxn(row: Record<string, unknown>): FinanceTransaction {
  return {
    id: String(row.id),
    source: row.source as FinanceSource,
    external_key: String(row.external_key),
    txn_date: String(row.txn_date),
    amount: Number(row.amount),
    kind: row.kind as FinanceTxnKind,
    currency: String(row.currency ?? "ILS"),
    description: String(row.description ?? ""),
    merchant: row.merchant != null ? String(row.merchant) : null,
    account_number: row.account_number != null ? String(row.account_number) : null,
    card_name: row.card_name != null ? String(row.card_name) : null,
    status: row.status as FinanceTxnStatus,
    category: row.category != null ? String(row.category) : null,
    purpose_note: row.purpose_note != null ? String(row.purpose_note) : null,
    needs_categorization: Boolean(row.needs_categorization),
    categorized_at: row.categorized_at != null ? String(row.categorized_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeInput(input: FinanceIngestInput): Omit<FinanceIngestInput, "external_key"> & {
  external_key: string;
  amount: number;
  kind: FinanceTxnKind;
  description: string;
  currency: string;
  status: FinanceTxnStatus;
  needs_categorization: boolean;
} {
  const amount = Math.abs(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_amount");
  const txn_date = input.txn_date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txn_date)) throw new Error("invalid_txn_date");

  const description = (input.description ?? input.merchant ?? "").trim() || "תנועה";
  const merchant = input.merchant?.trim() || null;
  const kind = input.kind ?? "expense";
  const hasCategory = Boolean(input.category?.trim());
  const needs_categorization =
    input.needs_categorization ?? (input.source === "apple_pay" || !hasCategory);

  return {
    ...input,
    txn_date,
    amount,
    kind,
    description,
    merchant,
    currency: (input.currency ?? "ILS").trim() || "ILS",
    status: input.status ?? "completed",
    needs_categorization: hasCategory ? false : needs_categorization,
    category: hasCategory ? input.category!.trim() : null,
    purpose_note: input.purpose_note?.trim() || null,
    external_key:
      input.external_key?.trim() ||
      financeExternalKey({
        source: input.source,
        account_number: input.account_number,
        identifier: input.identifier,
        txn_date,
        amount,
        description,
        merchant,
      }),
  };
}

async function notifyCategorize(txn: FinanceTransaction): Promise<void> {
  if (!txn.needs_categorization) return;
  const label = txn.merchant || txn.description;
  const sign = txn.kind === "income" ? "+" : "−";
  await notifyUser(
    "finance",
    {
      title: "תנועה חדשה",
      body: `${sign}₪${txn.amount.toFixed(2)} · ${label} — למה ההוצאה?`,
      data: {
        screen: `/finance-categorize?id=${txn.id}`,
      },
    },
    txn.id,
    { bypassQuiet: true }
  );
}

export type IngestResult = {
  created: FinanceTransaction[];
  skipped: number;
};

export async function ingestFinanceTransactions(
  inputs: FinanceIngestInput[]
): Promise<IngestResult> {
  const created: FinanceTransaction[] = [];
  let skipped = 0;

  for (const raw of inputs) {
    const input = normalizeInput(raw);
    const now = new Date().toISOString();
    const row = {
      source: input.source,
      external_key: input.external_key,
      txn_date: input.txn_date,
      amount: input.amount,
      kind: input.kind,
      currency: input.currency,
      description: input.description,
      merchant: input.merchant,
      account_number: input.account_number ?? null,
      card_name: input.card_name ?? null,
      status: input.status,
      category: input.category,
      purpose_note: input.purpose_note,
      needs_categorization: input.needs_categorization,
      categorized_at: input.category ? now : null,
      updated_at: now,
    };

    const { data, error } = await getSupabase()
      .from("finance_transactions")
      .insert(row)
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        skipped += 1;
        continue;
      }
      throw new Error(error.message);
    }
    if (!data) {
      skipped += 1;
      continue;
    }

    const txn = rowToTxn(data as Record<string, unknown>);
    created.push(txn);
    await notifyCategorize(txn);
  }

  return { created, skipped };
}
