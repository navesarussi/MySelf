import { formatMerchantLabel, normalizeMerchantKey } from "@/lib/finance/merchant-rules-client";
import type { RecurringSuggestion } from "@/lib/finance/types-client";

/** Stable dedup key: normalized merchant label + amount (+ ILS). */
export function recurringSuggestionDedupKey(
  s: Pick<RecurringSuggestion, "display_name" | "merchant_key" | "suggested_amount">
): string {
  const labels = [s.display_name, s.merchant_key]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => normalizeMerchantKey(formatMerchantLabel(v)).replace(/\s/g, ""));
  const canonical = labels.sort((a, b) => b.length - a.length)[0] ?? "";
  return `${canonical}|${s.suggested_amount}|ILS`;
}

/** Collapse duplicate suggestions that share merchant+amount after normalization. */
export function dedupeRecurringSuggestions(suggestions: RecurringSuggestion[]): RecurringSuggestion[] {
  const byKey = new Map<string, RecurringSuggestion>();

  for (const s of suggestions) {
    const key = recurringSuggestionDedupKey(s);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...s,
        display_name: formatMerchantLabel(s.display_name || s.merchant_key),
      });
      continue;
    }

    const display =
      (s.display_name?.length ?? 0) >= (existing.display_name?.length ?? 0)
        ? s.display_name
        : existing.display_name;

    byKey.set(key, {
      merchant_key: existing.merchant_key,
      display_name: formatMerchantLabel(display || existing.merchant_key),
      category: existing.category ?? s.category,
      suggested_amount: existing.suggested_amount,
      occurrences: Math.max(existing.occurrences, s.occurrences),
      months: [...new Set([...existing.months, ...s.months])].sort(),
      amounts: existing.amounts.length >= s.amounts.length ? existing.amounts : s.amounts,
    });
  }

  return [...byKey.values()].sort((a, b) => b.suggested_amount - a.suggested_amount);
}
