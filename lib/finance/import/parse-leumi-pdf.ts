import { parseHebrewStatementDate } from "@/lib/finance/import/rtl-date";
import type { ParseFileResult } from "@/lib/finance/import/types";

function extractField(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m?.[1]?.trim() ?? null;
}

/** Bank Leumi annual identity statement — account snapshot, not line-item txns. */
export function parseLeumiIdentityPdf(text: string): ParseFileResult {
  const warnings: string[] = ["leumi_annual_snapshot_only"];

  const reportDate = extractField(text, /נכונים ליום\s*(\d{2}\/\d{2}\/\d{2,4})/);
  const customerNumber = extractField(text, /מס\.?\s*לקוח\s*([\d/-]+)/);
  const accountNumbers = [...text.matchAll(/(\d{3})-(\d{7})/g)].map((m) => `${m[1]}-${m[2]}`);
  const avgBalance = extractField(text, /(\d[\d,.]*)\s*ש"ח\s*(\d[\d,.]*)\s*%/);
  const creditCardLimit = extractField(text, /(\d[\d,.]*)\s*ש"ח\s*(\d[\d,.]*)-/);
  const loanBalance = extractField(text, /יתרות:\s*\n\s*סה"כ יתרה[\s\S]*?(\d[\d,.]*)\s*$/m);

  const metadata: Record<string, unknown> = {
    document_type: "leumi_bank_identity_annual",
    report_date: reportDate ? parseHebrewStatementDate(reportDate) : null,
    customer_number: customerNumber,
    account_numbers: [...new Set(accountNumbers)],
    checking_avg_balance_ils: avgBalance ? Number(avgBalance.replace(/,/g, "")) : null,
    visa_cal_credit_limit_ils: creditCardLimit ? Number(creditCardLimit.replace(/,/g, "")) : null,
    loan_total_ils: loanBalance ? Number(loanBalance.replace(/,/g, "")) : null,
    has_transaction_lines: false,
  };

  if (!customerNumber && accountNumbers.length === 0) {
    warnings.push("leumi_metadata_partial");
  }

  return {
    source: "leumi",
    accountLabel: "Bank Leumi",
    accountMetadata: metadata,
    transactions: [],
    warnings,
  };
}
