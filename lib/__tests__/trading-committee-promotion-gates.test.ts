import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareDualTrack, type DualTrackMetricsRow } from "../trading/committee/dual-track";
import {
  DEFAULT_PROMOTION_CRITERIA,
  evaluatePromotionGates,
  type CommitteePromotionCriteria,
} from "../trading/committee/promotion-gates";

function row(partial: Partial<DualTrackMetricsRow> & Pick<DualTrackMetricsRow, "would_have_executed" | "outcome">): DualTrackMetricsRow {
  return {
    status: "COMPLETED",
    blocks: [],
    latency_ms: 50_000,
    ...partial,
  };
}

function passingFixture(count: number): DualTrackMetricsRow[] {
  const rows: DualTrackMetricsRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const agree = i % 5 !== 0;
    rows.push(
      row({
        ticket_id: `t${i}`,
        would_have_executed: agree,
        outcome: agree ? "WOULD_EXECUTE" : "SKIPPED",
        baseline_would_enter: agree,
        latency_ms: 40_000 + (i % 10) * 1_000,
      }),
    );
  }
  return rows;
}

describe("committee promotion proof gates", () => {
  const relaxed: CommitteePromotionCriteria = {
    minSampleSize: 10,
    minComparedBaselines: 10,
    maxDisagreementRate: 0.5,
    maxHardBlockFalsePositiveRate: 0.5,
    minResolvedBlocksForPnlBasis: 20,
    minNetRSavedPerBlock: 0,
    maxLatencyP95Ms: 120_000,
    maxErrorRate: 0.1,
  };

  it("PASS when all criteria met on dual-track summary", () => {
    const summary = compareDualTrack(passingFixture(120));
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.verdict, "PASS");
    assert.equal(eval_.reasons.length, 0);
    assert.ok(eval_.metrics.sample_size >= 120);
    assert.ok(eval_.metrics.disagreement_rate <= relaxed.maxDisagreementRate);
  });

  it("FAIL on insufficient sample size", () => {
    const summary = compareDualTrack(passingFixture(5));
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("sample_size")));
  });

  it("FAIL on high disagreement rate", () => {
    const rows: DualTrackMetricsRow[] = [
      row({ would_have_executed: true, outcome: "WOULD_EXECUTE", baseline_would_enter: false, latency_ms: 30_000 }),
      row({ would_have_executed: false, outcome: "SKIPPED", baseline_would_enter: true, latency_ms: 30_000 }),
      row({ would_have_executed: true, outcome: "WOULD_EXECUTE", baseline_would_enter: false, latency_ms: 30_000 }),
      row({ would_have_executed: false, outcome: "SKIPPED", baseline_would_enter: true, latency_ms: 30_000 }),
      ...passingFixture(20),
    ];
    const summary = compareDualTrack(rows);
    const eval_ = evaluatePromotionGates(summary, {
      ...relaxed,
      minSampleSize: 20,
      maxDisagreementRate: 0.1,
    });
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("disagreement_rate")));
  });

  it("FAIL on hard-block false-positive heuristic (committee-only blocks)", () => {
    const rows: DualTrackMetricsRow[] = [];
    for (let i = 0; i < 30; i += 1) {
      rows.push(
        row({
          would_have_executed: false,
          outcome: "BLOCKED",
          baseline_would_enter: true,
          blocks: ["KILL_SWITCH"],
          certificate: { ok: false, blocks: ["KILL_SWITCH"] },
          latency_ms: 45_000,
        }),
      );
    }
    const summary = compareDualTrack(rows);
    const eval_ = evaluatePromotionGates(summary, {
      ...relaxed,
      minSampleSize: 20,
      maxHardBlockFalsePositiveRate: 0.1,
    });
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("hard_block_fp_heuristic")));
    assert.ok(eval_.metrics.hard_block_false_positive_heuristic > 0.9);
  });

  it("FAIL on latency p95 over budget", () => {
    const rows = passingFixture(30).map((r, i) => ({ ...r, latency_ms: i < 28 ? 40_000 : 200_000 }));
    const summary = compareDualTrack(rows);
    const eval_ = evaluatePromotionGates(summary, {
      ...relaxed,
      minSampleSize: 20,
      maxLatencyP95Ms: 100_000,
    });
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("latency_p95")));
  });

  it("FAIL on error rate ceiling", () => {
    const rows: DualTrackMetricsRow[] = [
      ...passingFixture(20),
      row({ would_have_executed: false, outcome: "ERROR", status: "FAILED", baseline_would_enter: true, latency_ms: 1_000 }),
      row({ would_have_executed: false, outcome: "ERROR", status: "TIMEOUT", baseline_would_enter: true, latency_ms: 1_000 }),
    ];
    const summary = compareDualTrack(rows);
    const eval_ = evaluatePromotionGates(summary, {
      ...relaxed,
      minSampleSize: 20,
      maxErrorRate: 0.05,
    });
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("error_rate")));
  });

  it("DEFAULT_PROMOTION_CRITERIA is conservative", () => {
    assert.equal(DEFAULT_PROMOTION_CRITERIA.minSampleSize, 100);
    assert.ok(DEFAULT_PROMOTION_CRITERIA.maxDisagreementRate <= 0.4);
    assert.ok(DEFAULT_PROMOTION_CRITERIA.maxErrorRate <= 0.1);
  });

  it("evaluator does not mutate input summary", () => {
    const summary = compareDualTrack(passingFixture(15));
    const before = JSON.stringify(summary);
    evaluatePromotionGates(summary, relaxed);
    assert.equal(JSON.stringify(summary), before);
  });
});

/** A committee-only block whose baseline trade closed at `r` (null = never resolved). */
function blockedRow(id: string, r: number | null): DualTrackMetricsRow {
  return row({
    ticket_id: id,
    would_have_executed: false,
    outcome: "BLOCKED",
    blocks: ["PORTFOLIO_HEAT"],
    certificate: { ok: false, blocks: ["PORTFOLIO_HEAT"] },
    baseline_would_enter: true,
    latency_ms: 45_000,
    baseline_trade:
      r === null
        ? null
        : { track: "AGENT", state: "CLOSED", realized_r: r, realized_pnl: r * 100, closed_at: "2026-09-20T15:00:00.000Z" },
  });
}

const blocks = (r: number | null, count: number, tag = "b") =>
  Array.from({ length: count }, (_, i) => blockedRow(`${tag}${i}-${r}`, r));

describe("hard-block false positives from closed-trade PnL", () => {
  const relaxed: CommitteePromotionCriteria = {
    minSampleSize: 10,
    minComparedBaselines: 10,
    maxDisagreementRate: 0.5,
    maxHardBlockFalsePositiveRate: 0.25,
    minResolvedBlocksForPnlBasis: 20,
    minNetRSavedPerBlock: 0,
    maxLatencyP95Ms: 120_000,
    maxErrorRate: 0.1,
  };

  it("measures false positives over blocks with a known outcome, not over every comparison", () => {
    const summary = compareDualTrack([...passingFixture(40), ...blocks(-1, 15), ...blocks(2, 5)]);
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.metrics.hard_block_fp_basis, "closed_trade_pnl");
    assert.equal(eval_.metrics.hard_block_fp_sample, 20);
    assert.equal(eval_.metrics.hard_block_false_positive_rate, 0.25);
  });

  it("blocking a lot is not a failure when the blocks were losers — the old heuristic said otherwise", () => {
    const summary = compareDualTrack([...passingFixture(40), ...blocks(-1, 30)]);
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.metrics.hard_block_false_positive_rate, 0);
    assert.ok(eval_.metrics.hard_block_false_positive_heuristic > 0.25, "count heuristic would have failed this window");
    assert.equal(eval_.verdict, "PASS");
  });

  it("FAILs when the blocks skipped winners, naming the PnL basis", () => {
    const summary = compareDualTrack([...passingFixture(40), ...blocks(1.5, 16), ...blocks(-1, 8)]);
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("hard_block_fp_pnl")));
    assert.ok(eval_.reasons.some((r) => r.includes("n=24")), "reason states the resolved sample size");
  });

  it("FAILs on net R even when few blocks were winners — one big winner against many small losers", () => {
    const summary = compareDualTrack([...passingFixture(40), ...blocks(8, 1), ...blocks(-0.1, 19)]);
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.metrics.hard_block_false_positive_rate, 0.05);
    assert.equal(eval_.metrics.hard_block_r_saved, 1.9);
    assert.equal(eval_.metrics.hard_block_r_missed, 8);
    assert.equal(eval_.metrics.hard_block_net_r_per_block, -0.305);
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("hard_block_net_r")));
    assert.ok(!eval_.reasons.some((r) => r.includes("hard_block_fp")), "the rate itself is fine — the money is not");
  });

  it("falls back to the count heuristic when too few blocks have resolved", () => {
    const summary = compareDualTrack([...passingFixture(40), ...blocks(-1, 5), ...blocks(null, 20)]);
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.metrics.hard_block_fp_basis, "count_heuristic");
    assert.equal(eval_.metrics.hard_block_fp_sample, summary.dual_track.compared);
    assert.equal(eval_.metrics.hard_block_false_positive_rate, eval_.metrics.hard_block_false_positive_heuristic);
    assert.equal(eval_.metrics.hard_block_resolved, 5);
  });

  it("the fallback still fails a window with too many blocks, naming the heuristic", () => {
    const summary = compareDualTrack([...passingFixture(20), ...blocks(null, 19), ...blocks(-1, 1)]);
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.verdict, "FAIL");
    assert.ok(eval_.reasons.some((r) => r.includes("hard_block_fp_heuristic")));
  });

  it("does not evaluate net R on the fallback basis — there is no money to reason about", () => {
    const summary = compareDualTrack([...passingFixture(40), ...blocks(3, 2), ...blocks(null, 4)]);
    const eval_ = evaluatePromotionGates(summary, relaxed);
    assert.equal(eval_.metrics.hard_block_fp_basis, "count_heuristic");
    assert.ok(!eval_.reasons.some((r) => r.includes("hard_block_net_r")));
  });

  it("a window with no blocks at all passes on the fallback", () => {
    const eval_ = evaluatePromotionGates(compareDualTrack(passingFixture(40)), relaxed);
    assert.equal(eval_.metrics.hard_block_false_positive_rate, 0);
    assert.equal(eval_.metrics.hard_block_resolved, 0);
    assert.equal(eval_.verdict, "PASS");
  });

  it("defaults keep the PnL basis off until enough blocks have resolved", () => {
    assert.equal(DEFAULT_PROMOTION_CRITERIA.minResolvedBlocksForPnlBasis, 20);
    assert.equal(DEFAULT_PROMOTION_CRITERIA.minNetRSavedPerBlock, 0);
  });
});
