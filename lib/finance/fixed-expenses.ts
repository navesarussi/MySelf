import {
  pickPreferredMerchantLabel,
  recurringMerchantGroupKey,
  typicalChargeAmount,
} from "@/lib/finance/cal-duplicate";
import {
  fetchUnlinkedTxnIds,
  matchedTxnsForFixed,
  txnMatchesFixedKey,
  type MatchedTxn,
} from "@/lib/finance/fixed-expense-links";
import { formatDisplayMerchantName } from "@/lib/finance/merchant-display";
import { normalizeMerchantKey, type MerchantRule } from "@/lib/finance/merchant-rules-client";
import { round2 } from "@/lib/finance/money";
import type { FinanceTransaction } from "@/lib/finance/types";

export { isDormantFixedExpense, partitionFixedExpenses } from "@/lib/finance/fixed-expense-dormant";

export type { MatchedTxn };

export type FixedExpenseFrequency = "monthly" | "weekly" | "yearly";

export type FixedExpenseItem = {
  id: string;
  rule_id: string | null;
  merchant_key: string;
  name: string;
  category: string | null;
  planned_amount: number;
  actual_amount: number;
  frequency: FixedExpenseFrequency;
  charge_day: number | null;
  last_charge_date: string | null;
  last_charge_amount: number | null;
  default_note: string | null;
  is_active: boolean;
  matched_transactions?: MatchedTxn[];
};

function inferChargeDay(dates: string[]): number | null {
  if (dates.length === 0) return null;
  const days = dates.map((d) => Number(d.slice(8, 10))).filter((n) => n >= 1 && n <= 31);
  if (days.length === 0) return null;
  days.sort((a, b) => a - b);
  return days[Math.floor(days.length / 2)];
}

function fixedTxnsForKey(txns: FinanceTransaction[], key: string, unlinked: Set<string>): FinanceTransaction[] {
  return txns.filter((t) => txnMatchesFixedKey(t, key, unlinked));
}

function buildFromRule(
  rule: MerchantRule,
  month: string,
  monthTxns: FinanceTransaction[],
  historyTxns: FinanceTransaction[],
  unlinked: Set<string>
): FixedExpenseItem {
  const key = normalizeMerchantKey(rule.merchant_key);
  const monthMatches = fixedTxnsForKey(monthTxns, key, unlinked);
  const historyMatches = fixedTxnsForKey(historyTxns, key, unlinked);
  const actual_amount = round2(monthMatches.reduce((s, t) => s + t.amount, 0));
  const sortedHistory = [...historyMatches].sort((a, b) => b.txn_date.localeCompare(a.txn_date));
  const last = sortedHistory[0] ?? null;
  const nonzeroAmounts = sortedHistory.map((t) => t.amount).filter((a) => round2(a) > 0);
  const amounts = nonzeroAmounts.slice(0, 6);
  const planned =
    rule.planned_amount != null && rule.planned_amount > 0
      ? round2(Number(rule.planned_amount))
      : amounts.length
        ? typicalChargeAmount(amounts)
        : 0;

  const displayName =
    formatDisplayMerchantName(rule.display_name) ||
    formatDisplayMerchantName(rule.merchant_key) ||
    key;

  return {
    id: rule.id ?? key,
    rule_id: rule.id ?? null,
    merchant_key: key,
    name: displayName,
    category: rule.category,
    planned_amount: planned,
    actual_amount,
    frequency: (rule.frequency as FixedExpenseFrequency) ?? "monthly",
    charge_day: rule.charge_day ?? inferChargeDay(historyMatches.map((t) => t.txn_date)),
    last_charge_date: last?.txn_date ?? null,
    last_charge_amount: last ? round2(last.amount) : null,
    default_note: rule.default_note,
    is_active: rule.is_active !== false,
    matched_transactions: matchedTxnsForFixed(key, month, monthTxns, unlinked),
  };
}

function buildFromTxnGroup(
  key: string,
  month: string,
  monthTxns: FinanceTransaction[],
  historyTxns: FinanceTransaction[],
  unlinked: Set<string>
): FixedExpenseItem {
  const monthMatches = fixedTxnsForKey(monthTxns, key, unlinked);
  const historyMatches = fixedTxnsForKey(historyTxns, key, unlinked);
  const sortedHistory = [...historyMatches].sort((a, b) => b.txn_date.localeCompare(a.txn_date));
  const last = sortedHistory[0] ?? null;
  const rawLabel = pickPreferredMerchantLabel(
    ...monthMatches.flatMap((t) => [t.merchant, t.description]),
    ...historyMatches.flatMap((t) => [t.merchant, t.description])
  );
  const label = formatDisplayMerchantName(rawLabel || pickPreferredLabel(monthMatches, historyMatches) || key);
  const nonzeroAmounts = historyMatches.map((t) => t.amount).filter((a) => round2(a) > 0);
  const amounts = nonzeroAmounts.slice(0, 6);
  const category = sortedHistory.find((t) => t.category)?.category ?? null;
  const monthActual = round2(monthMatches.reduce((s, t) => s + t.amount, 0));

  return {
    id: `txn:${key}`,
    rule_id: null,
    merchant_key: key,
    name: label || key,
    category,
    planned_amount: amounts.length ? typicalChargeAmount(amounts) : monthActual > 0 ? monthActual : 0,
    actual_amount: round2(monthMatches.reduce((s, t) => s + t.amount, 0)),
    frequency: "monthly",
    charge_day: inferChargeDay(historyMatches.map((t) => t.txn_date)),
    last_charge_date: last?.txn_date ?? null,
    last_charge_amount: last ? round2(last.amount) : null,
    default_note: null,
    is_active: true,
    matched_transactions: matchedTxnsForFixed(key, month, monthTxns, unlinked),
  };
}

function pickPreferredLabel(monthTxns: FinanceTransaction[], historyTxns: FinanceTransaction[]): string {
  for (const t of [...monthTxns, ...historyTxns]) {
    if (t.merchant?.trim()) return t.merchant;
    if (t.description?.trim()) return t.description;
  }
  return "";
}

/** Build itemized fixed/recurring expenses for a month. */
export async function buildFixedExpenseItems(
  rules: MerchantRule[],
  month: string,
  monthTxns: FinanceTransaction[],
  historyTxns: FinanceTransaction[] = monthTxns
): Promise<FixedExpenseItem[]> {
  const fixedRules = rules.filter((r) => r.expense_type === "fixed" && r.kind !== "income");
  const seen = new Set<string>();
  const items: FixedExpenseItem[] = [];
  const unlinkedByKey = new Map<string, Set<string>>();

  async function unlinkedFor(key: string): Promise<Set<string>> {
    if (!unlinkedByKey.has(key)) unlinkedByKey.set(key, await fetchUnlinkedTxnIds(key));
    return unlinkedByKey.get(key)!;
  }

  for (const rule of fixedRules) {
    const key = normalizeMerchantKey(rule.merchant_key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(buildFromRule(rule, month, monthTxns, historyTxns, await unlinkedFor(key)));
  }

  for (const t of monthTxns) {
    if (t.kind !== "expense" || t.is_internal || t.expense_type !== "fixed") continue;
    const key = recurringMerchantGroupKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(buildFromTxnGroup(key, month, monthTxns, historyTxns, await unlinkedFor(key)));
  }

  return items.sort((a, b) => {
    const dayA = a.charge_day ?? 32;
    const dayB = b.charge_day ?? 32;
    if (dayA !== dayB) return dayA - dayB;
    const amtA = Math.max(a.planned_amount, a.actual_amount);
    const amtB = Math.max(b.planned_amount, b.actual_amount);
    if (amtB !== amtA) return amtB - amtA;
    return a.name.localeCompare(b.name, "he");
  });
}
