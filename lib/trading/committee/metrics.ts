import type { CommitteeRunResult } from "./runner";

/** Minimal row shape for offline aggregation (DB rows or fixtures). */
export type CommitteeMetricsRow = {
  would_have_executed: boolean;
  outcome: CommitteeRunResult["outcome"];
  status: CommitteeRunResult["status"];
  blocks: string[];
  latency_ms: number;
  soft_risk?: { allow?: boolean; reasons?: string[] } | null;
  certificate?: { ok?: boolean; blocks?: string[] } | null;
  /** Baseline deterministic/agent would enter (from linked trigger when available). */
  baseline_would_enter?: boolean | null;
  /** Baseline single-agent ENTER decision when present. */
  baseline_agent_enter?: boolean | null;
};

export type SkipReasonCount = { reason: string; count: number };

/** Did the baseline enter? The agent verdict when present, else the deterministic trigger flag. */
export function baselineWouldEnter(
  row: Pick<CommitteeMetricsRow, "baseline_would_enter" | "baseline_agent_enter">,
): boolean | null {
  if (row.baseline_agent_enter != null) return row.baseline_agent_enter;
  if (row.baseline_would_enter != null) return row.baseline_would_enter;
  return null;
}

export type CommitteeRunSummary = {
  total: number;
  would_execute: number;
  blocked: number;
  skipped: number;
  errors: number;
  hard_block_rate: number;
  baseline_agreement?: {
    compared: number;
    agree: number;
    disagree: number;
    agreement_rate: number;
  };
  skip_reasons: SkipReasonCount[];
  latency_ms: { p50: number | null; p90: number | null; p95: number | null };
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export function latencyPercentiles(rows: CommitteeMetricsRow[], percentiles = [50, 90, 95] as const): Record<string, number | null> {
  const sorted = rows.map((r) => r.latency_ms).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const out: Record<string, number | null> = {};
  for (const p of percentiles) out[`p${p}`] = percentile(sorted, p);
  return out;
}

/** Histogram of skip/block reasons from soft risk + hard certificate blocks. */
export function skipReasonHistogram(rows: CommitteeMetricsRow[]): SkipReasonCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.would_have_executed) continue;
    const reasons = row.soft_risk?.reasons ?? [];
    if (!row.soft_risk?.allow && reasons.length) {
      for (const r of reasons) counts.set(`soft:${r}`, (counts.get(`soft:${r}`) ?? 0) + 1);
    }
    for (const b of row.blocks) counts.set(`block:${b}`, (counts.get(`block:${b}`) ?? 0) + 1);
    if (!row.blocks.length && row.outcome === "SKIPPED") counts.set("outcome:SKIPPED", (counts.get("outcome:SKIPPED") ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** Share of runs where hard risk denied execution (certificate not ok or with blocks). */
export function hardBlockRate(rows: CommitteeMetricsRow[]): number {
  if (!rows.length) return 0;
  let blocked = 0;
  for (const row of rows) {
    const certDenied = row.certificate?.ok === false || (row.certificate?.blocks?.length ?? 0) > 0;
    const hardBlocked = row.outcome === "BLOCKED" || certDenied || row.blocks.length > 0;
    if (hardBlocked) blocked += 1;
  }
  return blocked / rows.length;
}

/**
 * Compare committee `would_have_executed` to baseline when baseline flags are present.
 * Agreement = both would enter or both would skip.
 */
export function baselineAgreement(rows: CommitteeMetricsRow[]): CommitteeRunSummary["baseline_agreement"] {
  const compared = rows.filter((r) => r.baseline_would_enter != null || r.baseline_agent_enter != null);
  if (!compared.length) return undefined;
  let agree = 0;
  for (const row of compared) {
    if ((baselineWouldEnter(row) ?? false) === row.would_have_executed) agree += 1;
  }
  return {
    compared: compared.length,
    agree,
    disagree: compared.length - agree,
    agreement_rate: agree / compared.length,
  };
}

/** Aggregate committee run rows for dual-track shadow comparison. */
export function summarizeCommitteeRuns(rows: CommitteeMetricsRow[]): CommitteeRunSummary {
  const lat = latencyPercentiles(rows);
  return {
    total: rows.length,
    would_execute: rows.filter((r) => r.would_have_executed).length,
    blocked: rows.filter((r) => r.outcome === "BLOCKED").length,
    skipped: rows.filter((r) => r.outcome === "SKIPPED").length,
    errors: rows.filter((r) => r.outcome === "ERROR" || r.status === "FAILED" || r.status === "TIMEOUT").length,
    hard_block_rate: hardBlockRate(rows),
    baseline_agreement: baselineAgreement(rows),
    skip_reasons: skipReasonHistogram(rows),
    latency_ms: { p50: lat.p50 ?? null, p90: lat.p90 ?? null, p95: lat.p95 ?? null },
  };
}
