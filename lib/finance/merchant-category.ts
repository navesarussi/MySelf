/** Normalize merchant/description for category lookup. */
export function normalizeMerchantKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type MerchantCategoryRow = {
  merchant: string | null;
  description: string;
  category: string;
};

/** Pick the most recent category for a merchant from prior categorized txns. */
export function suggestCategoryFromHistory(
  merchant: string | null | undefined,
  description: string | null | undefined,
  history: MerchantCategoryRow[]
): string | null {
  const keys = new Set<string>();
  const m = normalizeMerchantKey(merchant);
  const d = normalizeMerchantKey(description);
  if (m) keys.add(m);
  if (d) keys.add(d);

  for (const row of history) {
    const rm = normalizeMerchantKey(row.merchant);
    const rd = normalizeMerchantKey(row.description);
    if ((rm && keys.has(rm)) || (rd && keys.has(rd))) {
      return row.category;
    }
  }
  return null;
}
