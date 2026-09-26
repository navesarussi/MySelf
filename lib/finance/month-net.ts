/** Client-safe month net math — no Supabase or server imports. */
export {
  expenseCountsTowardNet,
  monthNet,
  monthNetFromPlanSections,
  monthNetFromTransactions,
  type MonthNetSplit,
  type MonthNetTotals,
  type MonthNetTxn,
} from "@/lib/finance/month-net-core";
