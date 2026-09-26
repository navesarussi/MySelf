/**
 * Idempotent backfill: mark existing Leumi card-settlement rows internal.
 *
 * Does NOT touch Leumi FX conversion debits (המרת קנ במטח) — those may be the
 * categorized expense-of-record in production. Does not change category,
 * purpose_note, or categorized_at on any row.
 *
 * Usage: tsx scripts/finance/backfill-card-settlement-internal.ts [--month=YYYY-MM]
 */
import { getSupabase } from "../../lib/supabase";
import { rowToTxn } from "../../lib/finance/ingest";
import { fetchTransactionsInRange, monthBounds } from "../../lib/finance/txn-range";
import { findReconcilableBatchTransactions } from "../../lib/finance/reconcile";

async function main() {
  const monthArg = process.argv.find((a) => a.startsWith("--month="))?.slice(8);
  const months: string[] = [];

  if (monthArg && /^\d{4}-\d{2}$/.test(monthArg)) {
    months.push(monthArg);
  } else {
    const { data, error } = await getSupabase()
      .from("finance_transactions")
      .select("txn_date")
      .eq("source", "leumi")
      .order("txn_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const m = String(row.txn_date).slice(0, 7);
      if (!months.includes(m)) months.push(m);
    }
  }

  let updated = 0;
  for (const month of months) {
    const txns = (await fetchTransactionsInRange(monthBounds(month))).map(rowToTxn);
    const result = findReconcilableBatchTransactions(txns);
    const ids = txns
      .filter(
        (t) =>
          result.reconciledIds.includes(t.id) &&
          !t.is_internal &&
          !t.categorized_at &&
          t.needs_categorization
      )
      .map((t) => t.id);

    if (!ids.length) continue;
    const now = new Date().toISOString();
    const { error } = await getSupabase()
      .from("finance_transactions")
      .update({ is_internal: true, needs_categorization: false, updated_at: now })
      .in("id", ids);
    if (error) throw new Error(error.message);
    updated += ids.length;
    console.log(`${month}: marked ${ids.length} card-settlement rows internal`);
  }

  console.log(`Done. Updated ${updated} rows.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
