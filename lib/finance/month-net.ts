/** Client-safe month net math — no Supabase or server imports. */
export {
  expenseCountsTowardNet,
  monthNet,
  monthNetFromTransactions,
  type MonthNetSplit,
  type MonthNetTotals,
  type MonthNetTxn,
} from "@/lib/finance/month-net-core";
