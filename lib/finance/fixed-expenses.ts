import { recurringMerchantGroupKey, typicalChargeAmount } from "@/lib/finance/cal-duplicate";
import { formatMerchantLabel, normalizeMerchantKey, type MerchantRule } from "@/lib/finance/merchant-rules-client";
import { round2 } from "@/lib/finance/money";
import type { FinanceTransaction } from "@/lib/finance/types";

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
};

function inferChargeDay(dates: string[]): number | null {
  if (dates.length === 0) return null;
  const days = dates.map((d) => Number(d.slice(8, 10))).filter((n) => n >= 1 && n <= 31);
  if (days.length === 0) return null;
  days.sort((a, b) => a - b);
  return days[Math.floor(days.length / 2)];
}

function fixedTxnsForKey(txns: FinanceTransaction[], key: string): FinanceTransaction[] {
  return txns.filter((t) => {
    if (t.kind !== "expense" || t.is_internal) return false;
    const groupKey = recurringMerchantGroupKey(t);
    return groupKey === key || normalizeMerchantKey(t.merchant) === key || normalizeMerchantKey(t.description) === key;
  });
}

function buildFromRule(
  rule: MerchantRule,
  monthTxns: FinanceTransaction[],
  historyTxns: FinanceTransaction[]
): FixedExpenseItem {
  const key = normalizeMerchantKey(rule.merchant_key);
  const monthMatches = fixedTxnsForKey(monthTxns, key);
  const historyMatches = fixedTxnsForKey(historyTxns, key);
  const actual_amount = round2(monthMatches.reduce((s, t) => s + t.amount, 0));
  const sortedHistory = [...historyMatches].sort((a, b) => b.txn_date.localeCompare(a.txn_date));
  const last = sortedHistory[0] ?? null;
  const amounts = sortedHistory.slice(0, 6).map((t) => t.amount);
  const planned =
    rule.planned_amount != null && rule.planned_amount >= 0
      ? round2(Number(rule.planned_amount))
      : amounts.length
        ? typicalChargeAmount(amounts)
        : 0;

  return {
    id: rule.id ?? key,
    rule_id: rule.id ?? null,
    merchant_key: key,
    name: rule.display_name?.trim() || formatMerchantLabel(rule.merchant_key) || key,
    category: rule.category,
    planned_amount: planned,
    actual_amount,
    frequency: (rule.frequency as FixedExpenseFrequency) ?? "monthly",
    charge_day: rule.charge_day ?? inferChargeDay(historyMatches.map((t) => t.txn_date)),
    last_charge_date: last?.txn_date ?? null,
    last_charge_amount: last ? round2(last.amount) : null,
    default_note: rule.default_note,
    is_active: rule.is_active !== false,
  };
}

function buildFromTxnGroup(key: string, monthTxns: FinanceTransaction[], historyTxns: FinanceTransaction[]): FixedExpenseItem {
  const monthMatches = fixedTxnsForKey(monthTxns, key);
  const historyMatches = fixedTxnsForKey(historyTxns, key);
  const sortedHistory = [...historyMatches].sort((a, b) => b.txn_date.localeCompare(a.txn_date));
  const last = sortedHistory[0] ?? null;
  const label = formatMerchantLabel(
    pickPreferredLabel(monthMatches, historyMatches) || key
  );
  const amounts = historyMatches.slice(0, 6).map((t) => t.amount);
  const category = sortedHistory.find((t) => t.category)?.category ?? null;

  return {
    id: `txn:${key}`,
    rule_id: null,
    merchant_key: key,
    name: label || key,
    category,
    planned_amount: amounts.length ? typicalChargeAmount(amounts) : round2(monthMatches.reduce((s, t) => s + t.amount, 0)),
    actual_amount: round2(monthMatches.reduce((s, t) => s + t.amount, 0)),
    frequency: "monthly",
    charge_day: inferChargeDay(historyMatches.map((t) => t.txn_date)),
    last_charge_date: last?.txn_date ?? null,
    last_charge_amount: last ? round2(last.amount) : null,
    default_note: null,
    is_active: true,
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
export function buildFixedExpenseItems(
  rules: MerchantRule[],
  monthTxns: FinanceTransaction[],
  historyTxns: FinanceTransaction[] = monthTxns
): FixedExpenseItem[] {
  const fixedRules = rules.filter((r) => r.expense_type === "fixed" && r.kind !== "income");
  const seen = new Set<string>();
  const items: FixedExpenseItem[] = [];

  for (const rule of fixedRules) {
    const key = normalizeMerchantKey(rule.merchant_key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(buildFromRule(rule, monthTxns, historyTxns));
  }

  for (const t of monthTxns) {
    if (t.kind !== "expense" || t.is_internal || t.expense_type !== "fixed") continue;
    const key = recurringMerchantGroupKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(buildFromTxnGroup(key, monthTxns, historyTxns));
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, "he"));
}
