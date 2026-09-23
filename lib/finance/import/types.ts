/** Import-layer source ids (upload UI + batch metadata). */
export type FinanceImportSource = "leumi" | "cal" | "max" | "excel" | "manual";

export type FinanceImportBatchStatus = "processing" | "completed" | "failed" | "partial";

export type FinanceImportRowCounts = {
  imported: number;
  skipped: number;
  errors: number;
};

export type FinanceImportError = {
  line?: number;
  message: string;
};

export type FinanceAccountRow = {
  id: string;
  user_id: string;
  source: FinanceImportSource;
  label: string;
  currency: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FinanceImportBatchRow = {
  id: string;
  user_id: string;
  source: FinanceImportSource;
  account_id: string | null;
  filename: string;
  status: FinanceImportBatchStatus;
  row_counts: FinanceImportRowCounts;
  errors: FinanceImportError[];
  created_at: string;
  completed_at: string | null;
};

/** Parsed row before mapping into finance_transactions ingest. */
export type ParsedImportTransaction = {
  booked_at: string;
  amount: number;
  kind: "income" | "expense";
  description: string;
  /** בית עסק — normalized merchant / payee name. */
  merchant?: string | null;
  /** Per-row currency (Cal FX rows may be USD/EUR). Default ILS. */
  currency?: string;
  installment_index?: number | null;
  installment_total?: number | null;
  installment_label?: string | null;
  source_ref: string;
  raw?: Record<string, unknown>;
};

export type ParseFileResult = {
  source: FinanceImportSource;
  accountLabel: string;
  accountMetadata: Record<string, unknown>;
  transactions: ParsedImportTransaction[];
  warnings: string[];
};

export type ImportUploadSummary = {
  batch_id: string;
  account_id: string;
  source: FinanceImportSource;
  filename: string;
  status: FinanceImportBatchStatus;
  imported: number;
  skipped: number;
  errors: FinanceImportError[];
  warnings: string[];
};
