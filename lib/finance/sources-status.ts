import { getSupabase } from "@/lib/supabase";
import type { FinanceSource } from "@/lib/finance/external-key";

export type FinanceSourceSummary = {
  source: FinanceSource;
  count: number;
  latest_txn_date: string | null;
  last_activity_at: string | null;
};

export type FinanceSourcesStatusResponse = {
  sources: FinanceSourceSummary[];
};

const TRACKED_SOURCES: FinanceSource[] = ["leumi", "apple_pay", "max", "visa_cal"];

export async function getFinanceSourcesStatus(): Promise<FinanceSourcesStatusResponse> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("finance_transactions")
    .select("source, txn_date, created_at")
    .in("source", TRACKED_SOURCES)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<
    FinanceSource,
    { count: number; latest_txn_date: string | null; last_activity_at: string | null }
  >();

  for (const s of TRACKED_SOURCES) {
    map.set(s, { count: 0, latest_txn_date: null, last_activity_at: null });
  }

  for (const row of (data as { source: FinanceSource; txn_date: string; created_at: string }[]) ?? []) {
    const entry = map.get(row.source);
    if (!entry) continue;
    entry.count += 1;
    if (!entry.latest_txn_date || row.txn_date > entry.latest_txn_date) {
      entry.latest_txn_date = row.txn_date;
    }
    if (!entry.last_activity_at || row.created_at > entry.last_activity_at) {
      entry.last_activity_at = row.created_at;
    }
  }

  const sources: FinanceSourceSummary[] = TRACKED_SOURCES.map((s) => ({
    source: s,
    count: map.get(s)?.count ?? 0,
    latest_txn_date: map.get(s)?.latest_txn_date ?? null,
    last_activity_at: map.get(s)?.last_activity_at ?? null,
  }));

  return { sources };
}
