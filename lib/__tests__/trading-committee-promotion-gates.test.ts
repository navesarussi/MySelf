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
