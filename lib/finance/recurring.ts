import { rowToTxn, type FinanceTransaction } from "@/lib/finance/ingest";
import {
  dedupeSameDayAmountCharges,
  isVariableTollMerchant,
  mergeRecurringMerchantGroups,
  pickPreferredMerchantLabel,
  recurringMerchantGroupKey,
  typicalChargeAmount,
} from "@/lib/finance/cal-duplicate";
import {
  fetchMerchantRulesMap,
  normalizeMerchantKey,
  upsertMerchantRule,
  type MerchantRule,
} from "@/lib/finance/merchant-rules";
import { round2 } from "@/lib/finance/money";
import { dedupeRecurringSuggestions } from "@/lib/finance/recurring-client";
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

function buildSuggestionForGroup(
  key: string,
  txns: FinanceTransaction[],
  rulesMap: Map<string, MerchantRule>
): RecurringSuggestion | null {
  if (isVariableTollMerchant(key) || txns.some((t) => isVariableTollMerchant(t))) return null;

  const existingRule = rulesMap.get(key) ?? rulesMap.get(normalizeMerchantKey(key));
  if (existingRule?.expense_type === "fixed") return null;

  const deduped = dedupeSameDayAmountCharges(txns);
  if (deduped.every((t) => t.expense_type === "fixed")) return null;

  const monthMap = new Map<string, number>();
  let latestCategory: string | null = null;

  for (const t of deduped) {
    const m = t.txn_date.slice(0, 7);
    monthMap.set(m, round2(t.amount));
    if (t.category) latestCategory = t.category;
  }

  const months = [...monthMap.keys()].sort();
  if (months.length < 2) return null;

  const amounts = months.map((m) => monthMap.get(m) ?? 0);
  if (!isAmountsSimilar(amounts)) return null;

  const display_name = pickPreferredMerchantLabel(...deduped.flatMap((t) => [t.merchant, t.description]));
  const suggested_amount = typicalChargeAmount(amounts);

  return {
    merchant_key: key,
    display_name: display_name || key,
    category: latestCategory,
    suggested_amount,
    occurrences: months.length,
    months,
    amounts,
  };
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
    const key = recurringMerchantGroupKey(t);
    if (!key) continue;
    const list = byMerchant.get(key) ?? [];
    list.push(t);
    byMerchant.set(key, list);
  }

  const mergedGroups = mergeRecurringMerchantGroups(byMerchant);

  const suggestions: RecurringSuggestion[] = [];
  for (const [key, txns] of mergedGroups.entries()) {
    const suggestion = buildSuggestionForGroup(key, txns, rulesMap);
    if (suggestion) suggestions.push(suggestion);
  }

  return dedupeRecurringSuggestions(suggestions);
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
  if (isVariableTollMerchant(input.merchant_key)) {
    throw new Error("variable_toll_not_fixed");
  }
  return upsertMerchantRule({
    merchant_key: input.merchant_key,
    category: input.category ?? null,
    expense_type: "fixed",
    kind: "expense",
  });
}
