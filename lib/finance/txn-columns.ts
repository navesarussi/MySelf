/** Columns for cashflow aggregation — includes fields for month-net expense typing. */
export const TXN_CASHFLOW_COLUMNS =
  "id, txn_date, amount, kind, category, needs_categorization, is_internal, merchant, description, expense_type";

/** Columns for transaction list cards (finance screen, categorize). */
export const TXN_LIST_COLUMNS =
  "id, source, external_key, txn_date, txn_time, amount, kind, currency, description, merchant, status, category, purpose_note, expense_type, is_internal, needs_categorization, created_at, updated_at";
