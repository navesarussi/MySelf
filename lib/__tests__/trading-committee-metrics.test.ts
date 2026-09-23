import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  baselineAgreement,
  hardBlockRate,
  latencyPercentiles,
  skipReasonHistogram,
  summarizeCommitteeRuns,
  type CommitteeMetricsRow,
} from "../trading/committee/metrics";

function row(partial: Partial<CommitteeMetricsRow> & Pick<CommitteeMetricsRow, "would_have_executed" | "outcome">): CommitteeMetricsRow {
  return {
    status: "COMPLETED",
    blocks: [],
    latency_ms: 1000,
    ...partial,
  };
}

describe("committee shadow metrics", () => {
  const fixture: CommitteeMetricsRow[] = [
    row({ would_have_executed: true, outcome: "WOULD_EXECUTE", latency_ms: 100, baseline_would_enter: true }),
    row({ would_have_executed: false, outcome: "BLOCKED", blocks: ["KILL_SWITCH"], certificate: { ok: false, blocks: ["KILL_SWITCH"] }, latency_ms: 200 }),
    row({
      would_have_executed: false,
      outcome: "BLOCKED",
      blocks: ["SOFT_RISK_DENY"],
      soft_risk: { allow: false, reasons: ["portfolio hot"] },
      certificate: { ok: false, blocks: ["SOFT_RISK_DENY"] },
      latency_ms: 300,
      baseline_would_enter: true,
    }),
    row({ would_have_executed: false, outcome: "SKIPPED", latency_ms: 400, baseline_would_enter: false }),
    row({ would_have_executed: true, outcome: "WOULD_EXECUTE", latency_ms: 500, baseline_agent_enter: false }),
  ];

  it("computes latency percentiles", () => {
    const p = latencyPercentiles(fixture);
    assert.equal(p.p50, 300);
    assert.equal(p.p90, 500);
    assert.equal(p.p95, 500);
  });

  it("builds skip reason histogram from soft risk and blocks", () => {
    const hist = skipReasonHistogram(fixture);
    assert.ok(hist.some((h) => h.reason === "block:KILL_SWITCH" && h.count === 1));
    assert.ok(hist.some((h) => h.reason === "soft:portfolio hot" && h.count === 1));
  });

  it("computes hard block rate", () => {
    const rate = hardBlockRate(fixture);
    assert.ok(rate >= 0.4 && rate <= 0.6);
  });

  it("compares baseline agreement when flags present", () => {
    const agree = baselineAgreement(fixture);
    assert.ok(agree);
    assert.equal(agree!.compared, 4);
    assert.equal(agree!.agree, 2);
    assert.equal(agree!.disagree, 2);
    assert.equal(agree!.agreement_rate, 0.5);
  });

  it("summarizeCommitteeRuns aggregates dual-track stats", () => {
    const summary = summarizeCommitteeRuns(fixture);
    assert.equal(summary.total, 5);
    assert.equal(summary.would_execute, 2);
    assert.equal(summary.blocked, 2);
    assert.ok(summary.hard_block_rate > 0);
    assert.equal(summary.latency_ms.p50, 300);
    assert.ok(summary.baseline_agreement);
    assert.ok(summary.skip_reasons.length >= 2);
  });
});
