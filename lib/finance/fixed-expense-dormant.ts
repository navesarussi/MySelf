import { round2 } from "@/lib/finance/money";
import type { FixedExpenseItem } from "@/lib/finance/fixed-expenses";

/** True when the fixed item has no meaningful charge history or month activity. */
export function isDormantFixedExpense(item: FixedExpenseItem): boolean {
  const lastAmt = item.last_charge_amount;
  const hasLastCharge = lastAmt != null && round2(lastAmt) > 0;
  const hasMonthActivity = round2(item.actual_amount) > 0;
  const hasPlanned = round2(item.planned_amount) > 0;

  if (hasMonthActivity || hasLastCharge) return false;
  if (hasPlanned && item.is_active) return false;
  return true;
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
