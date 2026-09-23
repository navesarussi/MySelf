import { round, roundMoney } from "../round";
import { baselineWouldEnter, type CommitteeMetricsRow } from "./metrics";

/**
 * Did a committee block save money or cost it?
 *
 * A shadow run that denied a ticket the baseline entered has a real answer
 * waiting for it: the baseline opened that trade, and the trade has since
 * closed with a realized R. If it closed red the block **avoided a loss**; if
 * it closed green the block **skipped a winner** — a false positive in the
 * literal sense, which is what the promotion gate's
 * `maxHardBlockFalsePositiveRate` claims to measure.
 *
 * Counting blocks instead (the Phase F placeholder) answers a different
 * question entirely — how often the committee blocks, not how often it was
 * wrong to. A committee that blocks every losing trade scores badly on counts
 * and perfectly on money.
 *
 * Pure: the caller joins `trading_committee_runs` to `trading_trades` through
 * `trigger_id` (see `store.ts`) and passes the result in.
 */

/** The trade the baseline actually took on the same trigger. */
export type BaselineTradeOutcome = {
  track?: string | null;
  state?: string | null;
  realized_r?: number | null;
  realized_pnl?: number | null;
  closed_at?: string | null;
};

export type BlockOutcomeRow = CommitteeMetricsRow & {
  ticket_id?: string;
  symbol?: string;
  strategy?: string;
  bar_time?: string;
  /** Outcome of what the baseline entered on the same trigger, when the join found one. */
  baseline_trade?: BaselineTradeOutcome | null;
};

export type BlockVerdict = "AVOIDED_LOSS" | "SKIPPED_WINNER" | "SCRATCH" | "UNRESOLVED";

export type AttributedBlock = {
  ticket_id?: string;
  symbol?: string;
  strategy?: string;
  verdict: BlockVerdict;
  realized_r: number | null;
  realized_pnl: number | null;
  primary_block?: string;
};

export type BlockAttributionSummary = {
  /** Committee-only blocks in the window (baseline would enter, committee would not). */
  blocks: number;
  /** Blocks whose baseline trade has closed with a realized R. */
  resolved: number;
  unresolved: number;
  skipped_winners: number;
  avoided_losses: number;
  scratches: number;
  /** `skipped_winners / resolved` — null while nothing has resolved. */
  false_positive_rate: number | null;
  /** R left on the table by the winners that were blocked (positive magnitude). */
  r_missed: number;
  /** R the blocked losers would have cost (positive magnitude). */
  r_saved: number;
  net_r_saved: number;
  net_r_per_block: number | null;
  pnl_missed: number;
  pnl_saved: number;
  cases: AttributedBlock[];
};

const EPSILON = 1e-9;

const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * R of a trade that actually finished. A trade still OPEN has no verdict yet,
 * and a CANCELLED one never entered — blocking it avoided nothing, so neither
 * counts for or against the committee.
 */
function resolvedR(trade?: BaselineTradeOutcome | null): number | null {
  if (!trade) return null;
  if ((trade.state ?? "").toUpperCase() !== "CLOSED") return null;
  return finite(trade.realized_r) ? trade.realized_r : null;
}

/** Baseline would have entered and the committee said no. */
export function isCommitteeOnlyBlock(row: Pick<BlockOutcomeRow, "would_have_executed" | "baseline_would_enter" | "baseline_agent_enter">): boolean {
  return baselineWouldEnter(row) === true && !row.would_have_executed;
}

export function classifyBlockOutcome(row: BlockOutcomeRow): AttributedBlock {
  const r = resolvedR(row.baseline_trade);
  const pnl = row.baseline_trade?.realized_pnl;
  return {
    ticket_id: row.ticket_id,
    symbol: row.symbol,
    strategy: row.strategy,
    verdict: r === null ? "UNRESOLVED" : r > EPSILON ? "SKIPPED_WINNER" : r < -EPSILON ? "AVOIDED_LOSS" : "SCRATCH",
    realized_r: r,
    realized_pnl: r === null || !finite(pnl) ? null : pnl,
    primary_block: row.blocks[0] ?? row.certificate?.blocks?.[0],
  };
}

/**
 * One trigger can carry both a deterministic and an agent trade. Prefer the one
 * that resolved, then the agent track — that is the baseline `baselineWouldEnter`
 * compares against — then the most recent close.
 */
export function pickBaselineTrade(trades: BaselineTradeOutcome[]): BaselineTradeOutcome | null {
  const rank = (t: BaselineTradeOutcome) =>
    (resolvedR(t) !== null ? 4 : 0) + ((t.track ?? "").toUpperCase() === "AGENT" ? 2 : 0);
  const closedAt = (t: BaselineTradeOutcome) => Date.parse(t.closed_at ?? "") || 0;
  let best: BaselineTradeOutcome | null = null;
  for (const t of trades) {
    if (!best || rank(t) > rank(best) || (rank(t) === rank(best) && closedAt(t) > closedAt(best))) best = t;
  }
  return best;
}

/** Aggregate closed-trade outcomes over the committee-only blocks in `rows`. */
export function attributeCommitteeBlocks(rows: BlockOutcomeRow[]): BlockAttributionSummary {
  const cases = rows.filter(isCommitteeOnlyBlock).map(classifyBlockOutcome);
  const of = (v: BlockVerdict) => cases.filter((c) => c.verdict === v);
  const winners = of("SKIPPED_WINNER");
  const losers = of("AVOIDED_LOSS");
  const resolved = cases.length - of("UNRESOLVED").length;

  const rMissed = winners.reduce((s, c) => s + (c.realized_r ?? 0), 0);
  const rSaved = losers.reduce((s, c) => s - (c.realized_r ?? 0), 0);

  return {
    blocks: cases.length,
    resolved,
    unresolved: cases.length - resolved,
    skipped_winners: winners.length,
    avoided_losses: losers.length,
    scratches: of("SCRATCH").length,
    false_positive_rate: resolved ? winners.length / resolved : null,
    r_missed: round(rMissed, 4),
    r_saved: round(rSaved, 4),
    net_r_saved: round(rSaved - rMissed, 4),
    net_r_per_block: resolved ? round((rSaved - rMissed) / resolved, 4) : null,
    pnl_missed: roundMoney(winners.reduce((s, c) => s + (c.realized_pnl ?? 0), 0)),
    pnl_saved: roundMoney(losers.reduce((s, c) => s - (c.realized_pnl ?? 0), 0)),
    cases,
  };
}
