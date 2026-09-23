/**
 * Reporting a standing condition once instead of every tick.
 *
 * A broker position with no open journal row that is not a trade we closed too
 * early is something the strategy never owned, and the code deliberately leaves
 * it alone — closing a position nobody asked it to open would be trading the
 * user's money on a guess. So the condition is real, worth surfacing, and
 * *permanent until a human acts on it*.
 *
 * Logged every tick that became ~1,150 rows a day and 80% of the whole trading
 * event log, burying fills, closes and kill-switch events in the feed the
 * dashboard renders. One report per symbol per day says the same thing.
 */

/**
 * Its own kind rather than the shared BROKER_DESYNC: that one covered three
 * unrelated conditions (this, a trade reopened because the broker still held
 * it, and a failed broker close), so deduping on it would have silenced a
 * genuine alert about a different problem on the same symbol.
 */
export const BROKER_ORPHAN_KIND = "BROKER_ORPHAN_POSITION";

const norm = (s: string) => s.trim().toUpperCase();

/** UTC day, so the window resets once a day wherever the tick runs. */
export function orphanReportDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Orphan symbols not yet reported today, in the caller's own spelling. */
export function orphansToReport(orphans: readonly string[], alreadyReported: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const s of alreadyReported) seen.add(norm(s));
  const out: string[] = [];
  for (const symbol of orphans) {
    const key = norm(symbol);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(symbol);
  }
  return out;
}
