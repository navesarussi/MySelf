import type { CommitteeRunResult } from "./runner";
import {
  baselineAgreement,
  hardBlockRate,
  latencyPercentiles,
  skipReasonHistogram,
  summarizeCommitteeRuns,
  type CommitteeMetricsRow,
  type CommitteeRunSummary,
} from "./metrics";

/** Row with optional identity fields for dual-track case lists. */
export type DualTrackMetricsRow = CommitteeMetricsRow & {
  ticket_id?: string;
  symbol?: string;
  strategy?: string;
  bar_time?: string;
};

export type DualTrackCase = {
  ticket_id?: string;
  symbol?: string;
  strategy?: string;
  bar_time?: string;
  committee_would_execute: boolean;
  baseline_would_enter: boolean;
  outcome: CommitteeRunResult["outcome"];
  blocks: string[];
  primary_block?: string;
};

export type HardBlockAttribution = {
  code: string;
  count: number;
  share_of_hard_blocks: number;
};

export type DualTrackBreakdown = {
  compared: number;
  agree: number;
  disagree: number;
  agreement_rate: number;
  committee_only_blocks: number;
  baseline_only_entries: number;
  committee_only_cases: DualTrackCase[];
  baseline_only_cases: DualTrackCase[];
  hard_block_attribution: HardBlockAttribution[];
};

export type DualTrackSummary = CommitteeRunSummary & {
  dual_track: DualTrackBreakdown;
};

/** Baseline enter when agent verdict exists, else deterministic trigger flag. */
export function baselineWouldEnter(row: CommitteeMetricsRow): boolean | null {
  if (row.baseline_agent_enter != null) return row.baseline_agent_enter;
  if (row.baseline_would_enter != null) return row.baseline_would_enter;
  return null;
}

function toCase(row: DualTrackMetricsRow): DualTrackCase {
  const blocks = row.blocks ?? [];
  return {
    ticket_id: row.ticket_id,
    symbol: row.symbol,
    strategy: row.strategy,
    bar_time: row.bar_time,
    committee_would_execute: row.would_have_executed,
    baseline_would_enter: baselineWouldEnter(row) ?? false,
    outcome: row.outcome,
    blocks,
    primary_block: blocks[0],
  };
}

/** Rows where baseline would enter but committee would not execute. */
export function committeeOnlyBlocks(rows: DualTrackMetricsRow[]): DualTrackCase[] {
  return rows
    .filter((row) => {
      const baseline = baselineWouldEnter(row);
      return baseline === true && !row.would_have_executed;
    })
    .map(toCase);
}

/** Rows where baseline would skip but committee would execute. */
export function baselineOnlyEntries(rows: DualTrackMetricsRow[]): DualTrackCase[] {
  return rows
    .filter((row) => {
      const baseline = baselineWouldEnter(row);
      return baseline === false && row.would_have_executed;
    })
    .map(toCase);
}

function isHardBlocked(row: CommitteeMetricsRow): boolean {
  const certDenied = row.certificate?.ok === false || (row.certificate?.blocks?.length ?? 0) > 0;
  return row.outcome === "BLOCKED" || certDenied || row.blocks.length > 0;
}

/** Count hard-risk block codes across runs where the certificate or blocks denied execution. */
export function hardBlockAttribution(rows: CommitteeMetricsRow[]): HardBlockAttribution[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (!isHardBlocked(row)) continue;
    const codes = row.blocks.length ? row.blocks : (row.certificate?.blocks ?? []);
    if (!codes.length) {
      counts.set("UNKNOWN_BLOCK", (counts.get("UNKNOWN_BLOCK") ?? 0) + 1);
      total += 1;
      continue;
    }
    for (const code of codes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
      total += 1;
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({
      code,
      count,
      share_of_hard_blocks: total ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/**
 * Full dual-track comparison: reuses Phase D metrics helpers and adds
 * committee-only blocks, baseline-only entries, and hard-block attribution.
 */
export function compareDualTrack(rows: DualTrackMetricsRow[]): DualTrackSummary {
  const base = summarizeCommitteeRuns(rows);
  const agreement = baselineAgreement(rows);
  const committeeBlocks = committeeOnlyBlocks(rows);
  const baselineEntries = baselineOnlyEntries(rows);
  const compared = agreement?.compared ?? 0;

  return {
    ...base,
    dual_track: {
      compared,
      agree: agreement?.agree ?? 0,
      disagree: agreement?.disagree ?? 0,
      agreement_rate: agreement?.agreement_rate ?? 0,
      committee_only_blocks: committeeBlocks.length,
      baseline_only_entries: baselineEntries.length,
      committee_only_cases: committeeBlocks,
      baseline_only_cases: baselineEntries,
      hard_block_attribution: hardBlockAttribution(rows),
    },
  };
}

/** Cron-safe entry: aggregate rows into a dual-track summary (pure, no I/O). */
export function buildDualTrackReport(rows: DualTrackMetricsRow[]): {
  generated_at: string;
  summary: DualTrackSummary;
  hard_block_rate: number;
  skip_reasons: ReturnType<typeof skipReasonHistogram>;
  latency_ms: ReturnType<typeof latencyPercentiles>;
} {
  return {
    generated_at: new Date().toISOString(),
    summary: compareDualTrack(rows),
    hard_block_rate: hardBlockRate(rows),
    skip_reasons: skipReasonHistogram(rows),
    latency_ms: latencyPercentiles(rows),
  };
}
