import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareDualTrack, type DualTrackMetricsRow } from "../trading/committee/dual-track";
import {
  buildGateEvalPersistRow,
  countConsecutivePassDays,
  evaluatePromotionGatesFromSummary,
  gateEvalIdForDay,
  utcEvalDay,
} from "../trading/committee/gate-eval";
import { DEFAULT_PROMOTION_CRITERIA, evaluatePromotionGates } from "../trading/committee/promotion-gates";

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

describe("committee nightly gate eval", () => {
  it("utcEvalDay returns UTC YYYY-MM-DD", () => {
    assert.equal(utcEvalDay(new Date("2026-09-23T23:30:00.000Z")), "2026-09-23");
    assert.equal(utcEvalDay(new Date("2026-09-24T00:30:00.000Z")), "2026-09-24");
  });

  it("gateEvalIdForDay is deterministic per eval day", () => {
    assert.equal(gateEvalIdForDay("2026-09-23"), "gate-eval-2026-09-23");
  });

  it("buildGateEvalPersistRow matches DB persist shape", () => {
    const summary = compareDualTrack(passingFixture(120));
    const evaluation = evaluatePromotionGates(summary, {
      minSampleSize: 100,
      minComparedBaselines: 50,
      maxDisagreementRate: 0.35,
      maxHardBlockFalsePositiveRate: 0.25,
      maxLatencyP95Ms: 90_000,
      maxErrorRate: 0.05,
    });
    const record = buildGateEvalPersistRow(evaluation, {
      evalDay: "2026-09-23",
      windowSince: "2026-08-24T00:00:00.000Z",
      windowLimit: 500,
      generatedAt: "2026-09-23T06:00:00.000Z",
    });

    assert.equal(record.id, "gate-eval-2026-09-23");
    assert.equal(record.eval_day, "2026-09-23");
    assert.equal(record.verdict, evaluation.verdict);
    assert.deepEqual(record.reasons, evaluation.reasons);
    assert.deepEqual(record.metrics, evaluation.metrics);
    assert.deepEqual(record.criteria, evaluation.criteria);
    assert.equal(record.window_limit, 500);
    assert.equal(record.window_since, "2026-08-24T00:00:00.000Z");
    assert.equal(record.generated_at, "2026-09-23T06:00:00.000Z");
    assert.ok(typeof record.metrics.sample_size === "number");
    assert.ok(record.verdict === "PASS" || record.verdict === "FAIL");
  });

  it("evaluatePromotionGatesFromSummary matches direct evaluator", () => {
    const summary = compareDualTrack(passingFixture(30));
    const direct = evaluatePromotionGates(summary, DEFAULT_PROMOTION_CRITERIA);
    const wrapped = evaluatePromotionGatesFromSummary(summary, DEFAULT_PROMOTION_CRITERIA);
    assert.deepEqual(wrapped, direct);
  });

  it("countConsecutivePassDays counts backward from anchor through calendar gaps", () => {
    const rows = [
      { eval_day: "2026-09-23", verdict: "PASS" as const },
      { eval_day: "2026-09-22", verdict: "PASS" as const },
      { eval_day: "2026-09-21", verdict: "FAIL" as const },
      { eval_day: "2026-09-20", verdict: "PASS" as const },
    ];
    assert.equal(countConsecutivePassDays(rows, "2026-09-23"), 2);
    assert.equal(countConsecutivePassDays(rows, "2026-09-22"), 1);
    assert.equal(countConsecutivePassDays(rows, "2026-09-21"), 0);
  });

  it("countConsecutivePassDays breaks on missing calendar day", () => {
    const rows = [
      { eval_day: "2026-09-23", verdict: "PASS" as const },
      { eval_day: "2026-09-21", verdict: "PASS" as const },
    ];
    assert.equal(countConsecutivePassDays(rows, "2026-09-23"), 1);
  });

  it("countConsecutivePassDays returns 0 when anchor day has no PASS row", () => {
    const rows = [{ eval_day: "2026-09-22", verdict: "PASS" as const }];
    assert.equal(countConsecutivePassDays(rows, "2026-09-23"), 0);
  });
});
