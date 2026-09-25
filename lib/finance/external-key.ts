import {
  assignStableExternalKeys,
  cardScopeFromAccount,
  stableTxnBaseKey,
  stableTxnExternalKey,
} from "@/lib/finance/stable-external-key";

export type FinanceSource = "leumi" | "apple_pay" | "manual" | "max" | "visa_cal" | "excel";

export function financeExternalKey(input: {
  source: FinanceSource;
  account_number?: string | null;
  card_name?: string | null;
  card_mask?: string | null;
  identifier?: string | number | null;
  txn_date: string;
  amount: number;
  currency?: string | null;
  description: string;
  merchant?: string | null;
  stable_ordinal?: number;
}): string {
  if (input.identifier != null && String(input.identifier).trim().length > 0) {
    const acct = (input.account_number ?? input.card_name ?? "default").trim() || "default";
    return `${input.source}:${acct}:${String(input.identifier).trim()}`;
  }
  const cardScope = cardScopeFromAccount(input);
  const base = stableTxnBaseKey({
    cardScope,
    txn_date: input.txn_date,
    amount: input.amount,
    currency: input.currency ?? "ILS",
  });
  return stableTxnExternalKey(base, input.stable_ordinal ?? 1);
}

/** Assign stable ordinals for a batch (count-based tie-break for same-day same-amount rows). */
export function financeExternalKeysForBatch(
  inputs: Array<{
    account_number?: string | null;
    card_name?: string | null;
    card_mask?: string | null;
    txn_date: string;
    amount: number;
    currency?: string | null;
  }>,
  cardScope?: string
): string[] {
  const scope =
    cardScope ??
    cardScopeFromAccount({
      account_number: inputs[0]?.account_number,
      card_name: inputs[0]?.card_name,
      card_mask: inputs[0]?.card_mask,
    });
  return assignStableExternalKeys(inputs, scope).map((row) => row.source_ref);
}
