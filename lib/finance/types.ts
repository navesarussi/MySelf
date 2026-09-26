import type { FinanceSource } from "@/lib/finance/external-key";

export type FinanceTxnKind = "income" | "expense";
export type FinanceTxnStatus = "pending" | "completed";

export type FinanceIngestInput = {
  source: FinanceSource;
  txn_date: string;
  /** ILS amount used for cashflow totals. */
  amount: number;
  kind?: FinanceTxnKind;
  currency?: string;
  original_amount?: number | null;
  amount_ils?: number | null;
  ils_estimated?: boolean;
  description?: string;
  merchant?: string | null;
  account_number?: string | null;
  card_name?: string | null;
  status?: FinanceTxnStatus;
  identifier?: string | number | null;
  external_key?: string;
  category?: string | null;
  purpose_note?: string | null;
  expense_type?: "fixed" | "variable" | "savings" | null;
  txn_time?: string | null;
  installment_index?: number | null;
  installment_total?: number | null;
  installment_label?: string | null;
  is_internal?: boolean;
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
  original_amount: number | null;
  amount_ils: number | null;
  ils_estimated: boolean;
  description: string;
  merchant: string | null;
  /** User-facing label from merchant rule display_name or shared formatter (API-only; not stored). */
  merchant_display?: string;
  account_number: string | null;
  card_name: string | null;
  status: FinanceTxnStatus;
  category: string | null;
  purpose_note: string | null;
  expense_type: "fixed" | "variable" | "savings" | null;
  txn_time?: string | null;
  installment_index: number | null;
  installment_total: number | null;
  installment_label: string | null;
  is_internal: boolean;
  needs_categorization: boolean;
  categorized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type { CashflowSummary as FinanceCashflow } from "@/lib/finance/cashflow";
export { FINANCE_CATEGORIES, type FinanceCategory } from "@/lib/finance/categories";
