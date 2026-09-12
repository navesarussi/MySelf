/** Columns for cashflow aggregation — no full row hydration. */
export const TXN_CASHFLOW_COLUMNS =
  "txn_date, amount, kind, category, needs_categorization";

/** Columns for transaction list cards (finance screen, categorize). */
export const TXN_LIST_COLUMNS =
  "id, source, external_key, txn_date, amount, kind, currency, description, merchant, status, category, purpose_note, needs_categorization, created_at, updated_at";
