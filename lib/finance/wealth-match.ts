import type { WealthCategory, WealthItem } from "@/lib/finance/wealth-types";

/**
 * Identity for a wealth snapshot line.
 *
 * `finance_wealth_items` has no unique constraint, and a pasted Cover /
 * הר הביטוח import is a *snapshot*: importing it again should refresh the
 * balances, not add a second copy of every policy. Category + name + provider
 * is what the paste actually gives us to recognise a line by.
 */
export type WealthIdentity = {
  category: WealthCategory;
  name: string;
  provider?: string | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Separator that cannot occur in a pasted name, so the parts cannot run together. */
const SEP = String.fromCharCode(0);

export function wealthItemKey(item: WealthIdentity): string {
  return [item.category, norm(item.name), norm(item.provider)].join(SEP);
}

/**
 * The row an imported line refers to, or null when it is genuinely new.
 * A provider-less line matches only a provider-less row — an import that has
 * lost the provider must not take over a named one.
 */
export function matchExistingWealthItem(
  existing: readonly WealthItem[],
  draft: WealthIdentity
): WealthItem | null {
  const key = wealthItemKey(draft);
  let best: WealthItem | null = null;
  for (const item of existing) {
    if (wealthItemKey(item) !== key) continue;
    // The table admits duplicates, so prefer the row most recently touched.
    if (!best || item.updated_at > best.updated_at) best = item;
  }
  return best;
}
