import type { DualTrackSummary } from "./dual-track";

/**
 * Typed thresholds for shadow → non-shadow promotion proof.
 * The evaluator is pure — it does not read or mutate env flags.
 * Ops may require these gates to PASS for N consecutive calendar days before
 * setting COMMITTEE_SHADOW=false (that duration check is outside this module).
 */
export type CommitteePromotionCriteria = {
  /** Minimum committee runs in the measurement window. */
  minSampleSize: number;
  /** Minimum rows with baseline comparison flags present. */
  minComparedBaselines: number;
  /** Max dual-track disagreement rate (disagree / compared). */
  maxDisagreementRate: number;
  /**
   * Placeholder heuristic for hard-block false positives until closed-trade PnL
   * attribution exists: committee-only blocks / compared (baseline enter, committee deny).
   */
  maxHardBlockFalsePositiveRate: number;
  /** Latency p95 budget (ms) from shadow runs. */
  maxLatencyP95Ms: number;
  /** Max error rate (ERROR outcomes / total runs). */
  maxErrorRate: number;
};

export type PromotionGateMetrics = {
  sample_size: number;
  compared: number;
  disagreement_rate: number;
  hard_block_false_positive_heuristic: number;
  latency_p95_ms: number | null;
  error_rate: number;
};

export type PromotionGateVerdict = "PASS" | "FAIL";

export type PromotionGateEvaluation = {
  verdict: PromotionGateVerdict;
  reasons: string[];
  metrics: PromotionGateMetrics;
  criteria: CommitteePromotionCriteria;
};

/** Conservative defaults — gates stay code-only until ops explicitly reviews PASS output. */
export const DEFAULT_PROMOTION_CRITERIA: CommitteePromotionCriteria = {
  minSampleSize: 100,
  minComparedBaselines: 50,
  maxDisagreementRate: 0.35,
  maxHardBlockFalsePositiveRate: 0.25,
  maxLatencyP95Ms: 90_000,
  maxErrorRate: 0.05,
};

function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return denominator === 0 ? 0 : NaN;
  return numerator / denominator;
}

/**
 * Pure evaluator over a dual-track summary (from `compareDualTrack` / `buildDualTrackReport`).
 * Returns PASS only when every criterion is met; otherwise FAIL with human-readable reasons.
 */
export function evaluatePromotionGates(
  summary: DualTrackSummary,
  criteria: CommitteePromotionCriteria = DEFAULT_PROMOTION_CRITERIA,
): PromotionGateEvaluation {
  const compared = summary.dual_track.compared;
  const disagree = summary.dual_track.disagree;
  const disagreementRate = safeRate(disagree, compared);
  const hardBlockFpHeuristic = safeRate(summary.dual_track.committee_only_blocks, compared);
  const errorRate = safeRate(summary.errors, summary.total);
  const latencyP95 = summary.latency_ms.p95;

  const metrics: PromotionGateMetrics = {
    sample_size: summary.total,
    compared,
    disagreement_rate: Number.isFinite(disagreementRate) ? disagreementRate : 1,
    hard_block_false_positive_heuristic: Number.isFinite(hardBlockFpHeuristic) ? hardBlockFpHeuristic : 1,
    latency_p95_ms: latencyP95,
    error_rate: Number.isFinite(errorRate) ? errorRate : 1,
  };

  const reasons: string[] = [];

  if (summary.total < criteria.minSampleSize) {
    reasons.push(`sample_size ${summary.total} < min ${criteria.minSampleSize}`);
  }
  if (compared < criteria.minComparedBaselines) {
    reasons.push(`compared_baselines ${compared} < min ${criteria.minComparedBaselines}`);
  }
  if (metrics.disagreement_rate > criteria.maxDisagreementRate) {
    reasons.push(
      `disagreement_rate ${(metrics.disagreement_rate * 100).toFixed(1)}% > max ${(criteria.maxDisagreementRate * 100).toFixed(1)}%`,
    );
  }
  if (metrics.hard_block_false_positive_heuristic > criteria.maxHardBlockFalsePositiveRate) {
    reasons.push(
      `hard_block_fp_heuristic ${(metrics.hard_block_false_positive_heuristic * 100).toFixed(1)}% > max ${(criteria.maxHardBlockFalsePositiveRate * 100).toFixed(1)}%`,
    );
  }
  if (latencyP95 == null) {
    reasons.push("latency_p95 unavailable (no runs with latency_ms)");
  } else if (latencyP95 > criteria.maxLatencyP95Ms) {
    reasons.push(`latency_p95 ${latencyP95}ms > max ${criteria.maxLatencyP95Ms}ms`);
  }
  if (metrics.error_rate > criteria.maxErrorRate) {
    reasons.push(`error_rate ${(metrics.error_rate * 100).toFixed(1)}% > max ${(criteria.maxErrorRate * 100).toFixed(1)}%`);
  }

  return {
    verdict: reasons.length ? "FAIL" : "PASS",
    reasons,
    metrics,
    criteria,
  };
}
