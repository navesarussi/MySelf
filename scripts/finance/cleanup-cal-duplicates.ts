/**
 * Delete Cal PDF OCR garbage duplicate finance rows (same day/amount/source).
 *
 * Prefers the JS heuristics in lib/finance/cal-duplicate.ts over raw SQL patterns.
 * Idempotent — safe to re-run after imports.
 *
 * Usage:
 *   npm run db:apply   # applies 0042_finance_cal_duplicate_cleanup.sql first
 *   tsx scripts/finance/cleanup-cal-duplicates.ts
 */
import { getSupabase } from "@/lib/supabase";
import {
  calDuplicateDayAmountKey,
  isCalOcrGarbageMerchant,
  txnRowQualityScore,
} from "@/lib/finance/cal-duplicate";
import type { FinanceTransaction } from "@/lib/finance/types";

type Row = Pick<
  FinanceTransaction,
  "id" | "txn_date" | "amount" | "source" | "merchant" | "description" | "created_at"
>;

function rowQuality(row: Row): number {
  return txnRowQualityScore(row);
}

function isGarbage(row: Row): boolean {
  return isCalOcrGarbageMerchant(row.merchant ?? row.description ?? "");
}

async function main() {
  const { data, error } = await getSupabase()
    .from("finance_transactions")
    .select("id, txn_date, amount, source, merchant, description, created_at")
    .eq("source", "visa_cal")
    .order("txn_date", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const key = calDuplicateDayAmountKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const toDelete = new Set<string>();

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const clean = group.filter((r) => !isGarbage(r));
    const garbage = group.filter((r) => isGarbage(r));
    if (!garbage.length) continue;

    if (clean.length) {
      for (const g of garbage) toDelete.add(g.id);
      continue;
    }

    const keep = [...garbage].sort((a, b) => {
      const q = rowQuality(b) - rowQuality(a);
      if (q !== 0) return q;
      return a.created_at.localeCompare(b.created_at);
    })[0];
    for (const g of garbage) {
      if (g.id !== keep.id) toDelete.add(g.id);
    }
  }

  if (!toDelete.size) {
    console.log("No Cal duplicate rows to delete.");
    return;
  }

  const ids = [...toDelete];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error: delErr } = await getSupabase().from("finance_transactions").delete().in("id", chunk);
    if (delErr) throw new Error(delErr.message);
  }

  console.log(`Deleted ${ids.length} Cal OCR duplicate row(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
