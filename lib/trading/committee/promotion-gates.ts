import type { BlockAttributionSummary } from "./block-attribution";
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
   * Max share of hard blocks that skipped a winner — measured from the closed
   * trade the baseline actually took (`block_attribution`), and falling back to
   * the count heuristic (committee-only blocks / compared) while too few blocks
   * have resolved.
   */
  maxHardBlockFalsePositiveRate: number;
  /** Blocks with a resolved closed trade needed before the PnL basis is used at all. */
  minResolvedBlocksForPnlBasis: number;
  /** Min average net R saved per resolved block. Only checked on the PnL basis. */
  minNetRSavedPerBlock: number;
  /** Latency p95 budget (ms) from shadow runs. */
  maxLatencyP95Ms: number;
  /** Max error rate (ERROR outcomes / total runs). */
  maxErrorRate: number;
};

/** Which measurement answered "was this block wrong?". */
export type HardBlockFpBasis = "closed_trade_pnl" | "count_heuristic";

export type PromotionGateMetrics = {
  sample_size: number;
  compared: number;
  disagreement_rate: number;
  /** The rate the gate actually judged, on `hard_block_fp_basis`. */
  hard_block_false_positive_rate: number;
  hard_block_fp_basis: HardBlockFpBasis;
  /** Resolved blocks on the PnL basis; compared rows on the fallback. */
  hard_block_fp_sample: number;
  hard_block_resolved: number;
  hard_block_r_saved: number;
  hard_block_r_missed: number;
  hard_block_net_r_saved: number;
  hard_block_net_r_per_block: number | null;
  /** Phase F placeholder, kept so stored gate-eval history stays comparable. */
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
  minResolvedBlocksForPnlBasis: 20,
  minNetRSavedPerBlock: 0,
  maxLatencyP95Ms: 90_000,
  maxErrorRate: 0.05,
};

function safeRate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return denominator === 0 ? 0 : NaN;
  return numerator / denominator;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

type HardBlockFp = { basis: HardBlockFpBasis; rate: number; sample: number };

/**
 * Prefer the money: false positives over the blocks whose baseline trade has
 * actually closed. Fall back to the Phase F count heuristic while too few have
 * resolved — that number answers a different question (how often the committee
 * blocks, not how often it was wrong to), so the basis travels with the metric.
 */
function hardBlockFalsePositives(
  attribution: BlockAttributionSummary,
  heuristic: number,
  compared: number,
  criteria: CommitteePromotionCriteria,
): HardBlockFp {
  const rate = attribution.false_positive_rate;
  if (rate != null && attribution.resolved >= criteria.minResolvedBlocksForPnlBasis) {
    return { basis: "closed_trade_pnl", rate, sample: attribution.resolved };
  }
  return { basis: "count_heuristic", rate: heuristic, sample: compared };
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
  const attribution = summary.dual_track.block_attribution;
  const heuristic = Number.isFinite(hardBlockFpHeuristic) ? hardBlockFpHeuristic : 1;
  const fp = hardBlockFalsePositives(attribution, heuristic, compared, criteria);

  const metrics: PromotionGateMetrics = {
    sample_size: summary.total,
    compared,
    disagreement_rate: Number.isFinite(disagreementRate) ? disagreementRate : 1,
    hard_block_false_positive_rate: fp.rate,
    hard_block_fp_basis: fp.basis,
    hard_block_fp_sample: fp.sample,
    hard_block_resolved: attribution.resolved,
    hard_block_r_saved: attribution.r_saved,
    hard_block_r_missed: attribution.r_missed,
    hard_block_net_r_saved: attribution.net_r_saved,
    hard_block_net_r_per_block: attribution.net_r_per_block,
    hard_block_false_positive_heuristic: heuristic,
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
    reasons.push(`disagreement_rate ${pct(metrics.disagreement_rate)} > max ${pct(criteria.maxDisagreementRate)}`);
  }
  if (fp.rate > criteria.maxHardBlockFalsePositiveRate) {
    const name = fp.basis === "closed_trade_pnl" ? "hard_block_fp_pnl" : "hard_block_fp_heuristic";
    reasons.push(`${name} ${pct(fp.rate)} (n=${fp.sample}) > max ${pct(criteria.maxHardBlockFalsePositiveRate)}`);
  }
  // Counts can flatter a committee that blocks nine small losers and one large
  // winner, so the blocks have to be net positive in R as well.
  if (fp.basis === "closed_trade_pnl" && attribution.net_r_per_block != null && attribution.net_r_per_block < criteria.minNetRSavedPerBlock) {
    reasons.push(
      `hard_block_net_r ${attribution.net_r_per_block.toFixed(3)}R per block (n=${attribution.resolved}) < min ${criteria.minNetRSavedPerBlock.toFixed(3)}R`,
    );
  }
  if (latencyP95 == null) {
    reasons.push("latency_p95 unavailable (no runs with latency_ms)");
  } else if (latencyP95 > criteria.maxLatencyP95Ms) {
    reasons.push(`latency_p95 ${latencyP95}ms > max ${criteria.maxLatencyP95Ms}ms`);
  }
  if (metrics.error_rate > criteria.maxErrorRate) {
    reasons.push(`error_rate ${pct(metrics.error_rate)} > max ${pct(criteria.maxErrorRate)}`);
  }

  return {
    verdict: reasons.length ? "FAIL" : "PASS",
    reasons,
    metrics,
    criteria,
  };
}
