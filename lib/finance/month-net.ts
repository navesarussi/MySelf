import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/db/paginate";
import { round2 } from "@/lib/finance/money";
import { monthBounds } from "@/lib/finance/txn-range";

type NetRow = { kind: string; amount: number | string | null };

/** Income minus expense; other kinds (transfers) don't count. */
export function monthNet(rows: NetRow[]): number {
  let net = 0;
  for (const row of rows) {
    const amount = Number(row.amount ?? 0);
    if (row.kind === "income") net += amount;
    else if (row.kind === "expense") net -= amount;
  }
  return round2(net);
}

/**
 * Month net for the home KPI. Summed here rather than with PostgREST's
 * `amount.sum()`: aggregates are disabled on this project, so that query
 * failed on every home load.
 */
export async function fetchMonthNetActual(month: string): Promise<number> {
  const { start, end } = monthBounds(month);
  const rows = await fetchAllRows<NetRow>(async (from, to) =>
    getSupabase()
      .from("finance_transactions")
      .select("kind, amount")
      .in("kind", ["income", "expense"])
      .eq("is_internal", false)
      .is("deleted_at", null)
      .gte("txn_date", start)
      .lt("txn_date", end)
      .order("id")
      .range(from, to)
  );
  return monthNet(rows);
}
