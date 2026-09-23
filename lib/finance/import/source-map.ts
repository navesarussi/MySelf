import type { FinanceSource } from "@/lib/finance/external-key";
import type { FinanceImportSource } from "@/lib/finance/import/types";

/** Map import-layer source to finance_transactions.source enum. */
export function importSourceToTxnSource(source: FinanceImportSource): FinanceSource {
  if (source === "cal") return "visa_cal";
  if (source === "leumi") return "leumi";
  if (source === "max") return "max";
  if (source === "excel") return "excel";
  return "manual";
}
