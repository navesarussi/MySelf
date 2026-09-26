import {
  resolveMerchantDisplay,
  withMerchantDisplay,
} from "@/lib/finance/merchant-display";
import {
  fetchMerchantRulesMap,
  findMerchantRule,
  type MerchantRule,
} from "@/lib/finance/merchant-rules";
import type { FinanceTransaction } from "@/lib/finance/types";

export { resolveMerchantDisplay, txnMerchantDisplay, withMerchantDisplay } from "@/lib/finance/merchant-display";

export async function enrichTransactionsWithMerchantDisplay<T extends FinanceTransaction>(
  txns: T[]
): Promise<Array<T & { merchant_display: string }>> {
  if (txns.length === 0) return [];
  const rulesMap = await fetchMerchantRulesMap();
  return txns.map((txn) => withMerchantDisplay(txn, rulesMap));
}

export async function enrichTransactionWithMerchantDisplay<T extends FinanceTransaction>(
  txn: T,
  rule?: MerchantRule | null
): Promise<T & { merchant_display: string }> {
  const matched = rule ?? (await findMerchantRule(txn.merchant, txn.description));
  return {
    ...txn,
    merchant_display: resolveMerchantDisplay({
      merchant: txn.merchant,
      description: txn.description,
      rule: matched,
    }),
  };
}
