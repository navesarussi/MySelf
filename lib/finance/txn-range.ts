import { getSupabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/db/paginate";

/**
 * Reading transactions over a date range.
 *
 * Five call sites — reconciliation, the month plan, recurring detection, the
 * cashflow endpoint and the history endpoint — each ran the same
 * `gte(txn_date) / lt(txn_date)` query with no limit. Past PostgREST's row cap
 * that returns a prefix, and every one of those five turns the rows into a
 * money figure the app displays: a month's income and expense, what a plan line
 * actually spent, which merchants look recurring, whether a card settlement
 * reconciles. A truncated read there is not a missing row, it is a wrong number
 * with no error anywhere. History reads up to 24 months at once.
 *
 * Four of them also carried their own copy of the month arithmetic, December
 * rollover included.
 */

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type DateRange = { start: string; end: string };

/** First day of `month` to first day of the next — end-exclusive. */
export function monthBounds(month: string): DateRange {
  if (!MONTH_RE.test(month)) throw new Error(`invalid_month:${month}`);
  const [y, m] = month.split("-").map(Number);
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start: `${month}-01`, end };
}

/** Start of the earliest month to the end of the latest. Order of the input does not matter. */
export function monthsBounds(months: readonly string[]): DateRange {
  if (!months.length) throw new Error("invalid_month:empty");
  const sorted = [...months].sort();
  return { start: monthBounds(sorted[0]).start, end: monthBounds(sorted[sorted.length - 1]).end };
}

/**
 * Every transaction in `[start, end)`, paged to exhaustion.
 *
 * Ordered by `id` because `range()` over an unordered query is not stable in
 * Postgres — pages could repeat rows and skip others. `id` is unique, so the
 * walk is deterministic; callers that need chronological order sort the result
 * themselves (the ones that care already do).
 */
export async function fetchTransactionsInRange(range: DateRange, columns = "*"): Promise<Record<string, unknown>[]> {
  return fetchAllRows<Record<string, unknown>>(async (from, to) => {
    const { data, error } = await getSupabase()
      .from("finance_transactions")
      .select(columns)
      .gte("txn_date", range.start)
      .lt("txn_date", range.end)
      .is("deleted_at", null)
      .order("id")
      .range(from, to);
    return { data: data as Record<string, unknown>[] | null, error };
  });
}
