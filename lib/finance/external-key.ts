import { createHash } from "crypto";

export type FinanceSource = "leumi" | "apple_pay" | "manual";

export function financeExternalKey(input: {
  source: FinanceSource;
  account_number?: string | null;
  identifier?: string | number | null;
  txn_date: string;
  amount: number;
  description: string;
  merchant?: string | null;
}): string {
  if (input.identifier != null && String(input.identifier).length > 0) {
    const acct = input.account_number ?? "default";
    return `${input.source}:${acct}:${input.identifier}`;
  }
  const merchant = (input.merchant ?? input.description).trim().toLowerCase();
  const raw = [
    input.source,
    input.txn_date,
    input.amount.toFixed(2),
    merchant,
    input.account_number ?? "",
  ].join("|");
  const hash = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  return `${input.source}:hash:${hash}`;
}
