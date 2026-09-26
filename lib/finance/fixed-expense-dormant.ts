import { round2 } from "@/lib/finance/money";
import type { FixedExpenseItem } from "@/lib/finance/fixed-expenses";

/** True when the fixed item has no charge in the current month or recent history. */
export function isDormantFixedExpense(item: FixedExpenseItem): boolean {
  const hasLastCharge = item.last_charge_amount != null && round2(item.last_charge_amount) > 0;
  const hasMonthActivity = round2(item.actual_amount) > 0;
  return !hasMonthActivity && !hasLastCharge;
}

/** Split fixed items into active list vs dormant (zero / no real charges). */
export function partitionFixedExpenses(items: FixedExpenseItem[]): {
  active: FixedExpenseItem[];
  dormant: FixedExpenseItem[];
} {
  const active: FixedExpenseItem[] = [];
  const dormant: FixedExpenseItem[] = [];
  for (const item of items) {
    if (isDormantFixedExpense(item)) dormant.push(item);
    else active.push(item);
  }
  return { active, dormant };
}
