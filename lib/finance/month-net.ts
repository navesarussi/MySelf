import { getSupabase } from "@/lib/supabase";
import { round2 } from "@/lib/finance/money";
import { monthBounds } from "@/lib/finance/txn-range";

type SumRow = { sum: number | null };

/** Aggregate month net without loading every transaction row (home KPI). */
export async function fetchMonthNetActual(month: string): Promise<number> {
  const { start, end } = monthBounds(month);
  const supabase = getSupabase();
  const filters = (kind: "income" | "expense") =>
    supabase
      .from("finance_transactions")
      .select("amount.sum()")
      .eq("kind", kind)
      .eq("is_internal", false)
      .gte("txn_date", start)
      .lt("txn_date", end);

  const [incomeRes, expenseRes] = await Promise.all([filters("income"), filters("expense")]);
  if (incomeRes.error) throw new Error(incomeRes.error.message);
  if (expenseRes.error) throw new Error(expenseRes.error.message);

  const income = Number((incomeRes.data?.[0] as SumRow | undefined)?.sum ?? 0);
  const expense = Number((expenseRes.data?.[0] as SumRow | undefined)?.sum ?? 0);
  return round2(income - expense);
}
