import { rowToTxn, type FinanceTransaction } from "@/lib/finance/ingest";
import {
  fetchMerchantRulesMap,
  normalizeMerchantKey,
  upsertMerchantRule,
  type MerchantRule,
} from "@/lib/finance/merchant-rules";
import { round2 } from "@/lib/finance/money";
import { fetchTransactionsInRange, monthsBounds } from "@/lib/finance/txn-range";

export type { RecurringSuggestion } from "@/lib/finance/types-client";
import type { RecurringSuggestion } from "@/lib/finance/types-client";

export function getRecentMonths(targetMonth: string, count = 3): string[] {
  const [y, m] = targetMonth.split("-").map(Number);
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let yr = y;
    let mo = m - i;
    while (mo <= 0) {
      mo += 12;
      yr -= 1;
    }
    result.push(`${yr}-${String(mo).padStart(2, "0")}`);
  }
  return result;
}


function isAmountsSimilar(amounts: number[]): boolean {
  if (amounts.length === 0) return false;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (avg <= 0) return false;
  const diff = max - min;
  return diff <= 1 || diff / avg <= 0.1;
}

export function findRecurringExpenseSuggestions(
  transactions: FinanceTransaction[],
  existingRules?: Map<string, MerchantRule> | MerchantRule[]
): RecurringSuggestion[] {
  const rulesMap =
    existingRules instanceof Map
      ? existingRules
      : new Map((existingRules ?? []).map((r) => [normalizeMerchantKey(r.merchant_key), r]));

  const byMerchant = new Map<string, FinanceTransaction[]>();
  for (const t of transactions) {
    if (t.kind !== "expense" || t.is_internal) continue;
    const key = normalizeMerchantKey(t.merchant || t.description);
    if (!key) continue;
    const list = byMerchant.get(key) ?? [];
    list.push(t);
    byMerchant.set(key, list);
  }

  const suggestions: RecurringSuggestion[] = [];

  for (const [key, txns] of byMerchant.entries()) {
    const existingRule = rulesMap.get(key);
    if (existingRule?.expense_type === "fixed") continue;

    const allFixed = txns.every((t) => t.expense_type === "fixed");
    if (allFixed) continue;

    const monthMap = new Map<string, number>();
    let latestCategory: string | null = null;
    let latestName = key;

    const sortedTxns = [...txns].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    for (const t of sortedTxns) {
      const m = t.txn_date.slice(0, 7);
      monthMap.set(m, (monthMap.get(m) ?? 0) + t.amount);
      if (t.category) latestCategory = t.category;
      if (t.merchant || t.description) latestName = (t.merchant || t.description).trim();
    }

    const months = [...monthMap.keys()].sort();
    if (months.length < 2) continue;

    const amounts = months.map((m) => round2(monthMap.get(m) ?? 0));
    if (!isAmountsSimilar(amounts)) continue;

    const avg = round2(amounts.reduce((a, b) => a + b, 0) / amounts.length);

    suggestions.push({
      merchant_key: key,
      display_name: latestName,
      category: latestCategory,
      suggested_amount: avg,
      occurrences: months.length,
      months,
      amounts,
    });
  }

  return suggestions.sort((a, b) => b.suggested_amount - a.suggested_amount);
}

export async function getRecurringSuggestions(
  targetMonth?: string
): Promise<RecurringSuggestion[]> {
  const month = targetMonth ?? new Date().toISOString().slice(0, 7);
  const recentMonths = getRecentMonths(month, 3);
  const [rows, rulesMap] = await Promise.all([
    fetchTransactionsInRange(monthsBounds(recentMonths)),
    fetchMerchantRulesMap(),
  ]);
  const txns = rows.map(rowToTxn);

  return findRecurringExpenseSuggestions(txns, rulesMap);
}

export async function applyRecurringSuggestion(input: {
  merchant_key: string;
  category?: string | null;
  planned_amount?: number;
}): Promise<MerchantRule | null> {
  return upsertMerchantRule({
    merchant_key: input.merchant_key,
    category: input.category ?? null,
    expense_type: "fixed",
    kind: "expense",
  });
}
