import { getSupabase } from "@/lib/supabase";
import type { FinanceSource } from "@/lib/finance/external-key";

export type {
  FinanceSourceSummary,
  FinanceSourcesStatusResponse,
} from "@/lib/finance/types-client";
import type { FinanceSourceSummary, FinanceSourcesStatusResponse } from "@/lib/finance/types-client";

const TRACKED_SOURCES: FinanceSource[] = ["leumi", "apple_pay", "max", "visa_cal"];

/** What one source's three probes found. */
export type SourceProbe = {
  count: number;
  latest_txn_date: string | null;
  last_activity_at: string | null;
};

/** Assemble the per-source probes into the response, one row per tracked source. */
export function summarizeSourceRows(probes: Map<FinanceSource, SourceProbe>): FinanceSourceSummary[] {
  return TRACKED_SOURCES.map((source) => ({
    source,
    count: probes.get(source)?.count ?? 0,
    latest_txn_date: probes.get(source)?.latest_txn_date ?? null,
    last_activity_at: probes.get(source)?.last_activity_at ?? null,
  }));
}

/**
 * Per-source health: how many transactions we hold, how recent they are, and
 * when the source last delivered anything.
 *
 * This used to `select()` every transaction of every tracked source and count
 * them in JS. Past PostgREST's row cap that returns a prefix, so the count
 * silently stopped growing — a personal finance history crosses 1000 rows in
 * months — and it pulled the whole table across the wire to produce four
 * numbers. The count comes from the database now, and each date from a single
 * row, ordered by the column that actually answers the question: `txn_date` for
 * how current the data is, `created_at` for when the sync last ran.
 */
async function probeSource(source: FinanceSource): Promise<SourceProbe> {
  const sb = getSupabase();
  const [counted, newestTxn] = await Promise.all([
    sb
      .from("finance_transactions")
      .select("created_at", { count: "exact" })
      .eq("source", source)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
    sb
      .from("finance_transactions")
      .select("txn_date")
      .eq("source", source)
      .is("deleted_at", null)
      .order("txn_date", { ascending: false })
      .limit(1),
  ]);

  if (counted.error) throw new Error(counted.error.message);
  if (newestTxn.error) throw new Error(newestTxn.error.message);

  const lastActivity = (counted.data as { created_at: string }[] | null)?.[0]?.created_at ?? null;
  const latestTxn = (newestTxn.data as { txn_date: string }[] | null)?.[0]?.txn_date ?? null;
  return {
    count: counted.count ?? 0,
    latest_txn_date: latestTxn,
    last_activity_at: lastActivity,
  };
}

export async function getFinanceSourcesStatus(): Promise<FinanceSourcesStatusResponse> {
  const probes = new Map<FinanceSource, SourceProbe>();
  const results = await Promise.all(
    TRACKED_SOURCES.map(async (source) => [source, await probeSource(source)] as const)
  );
  for (const [source, probe] of results) probes.set(source, probe);
  return { sources: summarizeSourceRows(probes) };
}
