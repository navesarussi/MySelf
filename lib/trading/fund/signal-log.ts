import { getSupabase } from "@/lib/supabase";
import type { Signal } from "../strategy/multi";

/** What happened to a book signal: ENTERED, or the block reason the pass used. */
export const ENTERED = "ENTERED";

export type SignalLogRow = {
  bar: string;
  grp: string;
  strategy: string;
  symbol: string;
  score: number | null;
  entry: number;
  stop: number;
  target: number | null;
  planned_size: number | null;
  planned_risk_usd: number | null;
  decision: string;
  trade_id: string | null;
};

type SigLike = Pick<Signal, "strategy" | "score" | "entry" | "stop" | "target"> & { a: { symbol: string } };

export function signalRow(input: { bar: string; grp: string; sig: SigLike; decision: string; size?: number | null; riskUsd?: number | null; tradeId?: string | null }): SignalLogRow {
  const { sig } = input;
  return {
    bar: input.bar,
    grp: input.grp,
    strategy: sig.strategy,
    symbol: sig.a.symbol,
    score: Number.isFinite(sig.score) ? sig.score : null,
    entry: sig.entry,
    stop: sig.stop,
    target: sig.target ?? null,
    planned_size: input.size ?? null,
    planned_risk_usd: input.riskUsd ?? null,
    decision: input.decision,
    trade_id: input.tradeId ?? null,
  };
}

/** One row per (bar, strategy, symbol), last decision wins — Postgres rejects an upsert batch touching a row twice. */
export function dedupeSignalRows(rows: SignalLogRow[]): SignalLogRow[] {
  const m = new Map<string, SignalLogRow>();
  for (const r of rows) m.set(`${r.bar}|${r.strategy}|${r.symbol}`, r);
  return [...m.values()];
}

/** Never throws: the log must not block trading. */
export async function saveSignalLog(rows: SignalLogRow[], errors: string[]): Promise<void> {
  if (!rows.length) return;
  try {
    const { error } = await getSupabase().from("trading_book_signals").upsert(dedupeSignalRows(rows), { onConflict: "bar,strategy,symbol" });
    if (error) errors.push(`signal_log: ${error.message.slice(0, 120)}`);
  } catch (err) {
    errors.push(`signal_log: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
  }
}
