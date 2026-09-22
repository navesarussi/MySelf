import type { FinanceSource } from "@/lib/finance/external-key";

export type RecurringSuggestion = {
  merchant_key: string;
  display_name: string;
  category: string | null;
  suggested_amount: number;
  occurrences: number;
  months: string[];
  amounts: number[];
};

export type FinanceSourceSummary = {
  source: FinanceSource;
  count: number;
  latest_txn_date: string | null;
  last_activity_at: string | null;
};

export type FinanceSourcesStatusResponse = {
  sources: FinanceSourceSummary[];
};
