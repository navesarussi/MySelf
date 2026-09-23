import { getSupabase } from "@/lib/supabase";
import { ingestFinanceTransactions, type FinanceIngestInput } from "@/lib/finance/ingest";
import { parseImportFile } from "@/lib/finance/import/parse-file";
import { importSourceToTxnSource } from "@/lib/finance/import/source-map";
import { isFinanceImportLayerMissing } from "@/lib/finance/import/table-missing";
import type {
  FinanceImportBatchStatus,
  FinanceImportError,
  FinanceImportSource,
  ImportUploadSummary,
} from "@/lib/finance/import/types";

export class FinanceImportLayerError extends Error {
  constructor(
    message: string,
    readonly code: "tables_missing" | "parse_failed" | "db_error"
  ) {
    super(message);
    this.name = "FinanceImportLayerError";
  }
}

async function upsertAccount(input: {
  userId: string;
  source: FinanceImportSource;
  label: string;
  currency: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data: existing } = await sb
    .from("finance_accounts")
    .select("id")
    .eq("user_id", input.userId)
    .eq("source", input.source)
    .eq("label", input.label)
    .maybeSingle();

  if (existing?.id) {
    await sb
      .from("finance_accounts")
      .update({ metadata: input.metadata, currency: input.currency, updated_at: now })
      .eq("id", existing.id);
    return String(existing.id);
  }

  const { data, error } = await sb
    .from("finance_accounts")
    .insert({
      user_id: input.userId,
      source: input.source,
      label: input.label,
      currency: input.currency,
      metadata: input.metadata,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data) throw new FinanceImportLayerError(error?.message ?? "account_insert_failed", "db_error");
  return String(data.id);
}

function batchStatus(imported: number, skipped: number, errors: FinanceImportError[]): FinanceImportBatchStatus {
  if (errors.length > 0 && imported === 0) return "failed";
  if (errors.length > 0) return "partial";
  return "completed";
}

export async function runFinanceImport(input: {
  userId: string;
  filename: string;
  buffer: Buffer;
  mime?: string | null;
  sourceHint?: FinanceImportSource | null;
}): Promise<ImportUploadSummary> {
  if (await isFinanceImportLayerMissing()) {
    throw new FinanceImportLayerError("finance_import_tables_missing", "tables_missing");
  }

  const sb = getSupabase();
  const parsed = await parseImportFile(input);
  const parseErrors: FinanceImportError[] = parsed.warnings
    .filter((w) => w.startsWith("parse_errors:"))
    .map((w) => ({ message: w }));

  const { data: batchRow, error: batchErr } = await sb
    .from("finance_import_batches")
    .insert({
      user_id: input.userId,
      source: parsed.source,
      filename: input.filename,
      status: "processing",
    })
    .select("id")
    .single();

  if (batchErr || !batchRow) {
    throw new FinanceImportLayerError(batchErr?.message ?? "batch_insert_failed", "db_error");
  }

  const batchId = String(batchRow.id);
  let accountId: string;
  try {
    accountId = await upsertAccount({
      userId: input.userId,
      source: parsed.source,
      label: parsed.accountLabel,
      currency: "ILS",
      metadata: parsed.accountMetadata,
    });
  } catch (err) {
    await sb
      .from("finance_import_batches")
      .update({
        status: "failed",
        errors: [{ message: err instanceof Error ? err.message : "account_failed" }],
        completed_at: new Date().toISOString(),
      })
      .eq("id", batchId);
    throw err;
  }

  await sb.from("finance_import_batches").update({ account_id: accountId }).eq("id", batchId);

  const txnSource = importSourceToTxnSource(parsed.source);
  const ingestInputs: FinanceIngestInput[] = parsed.transactions.map((t) => ({
    source: txnSource,
    txn_date: t.booked_at,
    amount: t.amount,
    kind: t.kind,
    currency: t.currency ?? "ILS",
    description: t.description,
    merchant: t.merchant ?? null,
    external_key: t.source_ref,
    category: null,
  }));

  let imported = 0;
  let skipped = 0;
  const ingestErrors: FinanceImportError[] = [...parseErrors];

  if (ingestInputs.length > 0) {
    try {
      const result = await ingestFinanceTransactions(ingestInputs);
      imported = result.created.length;
      skipped = result.skipped;

      const now = new Date().toISOString();
      for (const txn of result.created) {
        await sb
          .from("finance_transactions")
          .update({
            user_id: input.userId,
            account_id: accountId,
            import_batch_id: batchId,
            source_ref: txn.external_key,
            raw: parsed.transactions.find((p) => p.source_ref === txn.external_key)?.raw ?? null,
            updated_at: now,
          })
          .eq("id", txn.id);
      }
    } catch (err) {
      ingestErrors.push({ message: err instanceof Error ? err.message : "ingest_failed" });
    }
  }

  const status = batchStatus(imported, skipped, ingestErrors);
  const row_counts = { imported, skipped, errors: ingestErrors.length };
  await sb
    .from("finance_import_batches")
    .update({
      status,
      row_counts,
      errors: ingestErrors,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batchId);

  return {
    batch_id: batchId,
    account_id: accountId,
    source: parsed.source,
    filename: input.filename,
    status,
    imported,
    skipped,
    errors: ingestErrors,
    warnings: parsed.warnings,
  };
}

export async function listImportBatches(userId: string, limit = 20) {
  if (await isFinanceImportLayerMissing()) return [];
  const { data, error } = await getSupabase()
    .from("finance_import_batches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new FinanceImportLayerError(error.message, "db_error");
  return data ?? [];
}

export async function listRecentImportTransactions(userId: string, limit = 30) {
  if (await isFinanceImportLayerMissing()) return [];
  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .select("id, txn_date, amount, kind, description, merchant, currency, source, import_batch_id, created_at")
    .eq("user_id", userId)
    .not("import_batch_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new FinanceImportLayerError(error.message, "db_error");
  return data ?? [];
}
