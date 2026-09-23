import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  baselineWouldEnter,
  baselineOnlyEntries,
  buildDualTrackReport,
  committeeOnlyBlocks,
  compareDualTrack,
  hardBlockAttribution,
  type DualTrackMetricsRow,
} from "../trading/committee/dual-track";

function row(partial: Partial<DualTrackMetricsRow> & Pick<DualTrackMetricsRow, "would_have_executed" | "outcome">): DualTrackMetricsRow {
  return {
    status: "COMPLETED",
    blocks: [],
    latency_ms: 100,
    ...partial,
  };
}

describe("committee dual-track comparison", () => {
  const fixture: DualTrackMetricsRow[] = [
    row({
      ticket_id: "t1",
      symbol: "AAPL",
      would_have_executed: true,
      outcome: "WOULD_EXECUTE",
      baseline_would_enter: true,
    }),
    row({
      ticket_id: "t2",
      symbol: "MSFT",
      would_have_executed: false,
      outcome: "BLOCKED",
      blocks: ["KILL_SWITCH"],
      certificate: { ok: false, blocks: ["KILL_SWITCH"] },
      baseline_would_enter: true,
    }),
    row({
      ticket_id: "t3",
      symbol: "NVDA",
      would_have_executed: false,
      outcome: "BLOCKED",
      blocks: ["SOFT_RISK_DENY"],
      certificate: { ok: false, blocks: ["SOFT_RISK_DENY"] },
      baseline_would_enter: true,
    }),
    row({
      ticket_id: "t4",
      symbol: "TSLA",
      would_have_executed: true,
      outcome: "WOULD_EXECUTE",
      baseline_agent_enter: false,
    }),
    row({
      ticket_id: "t5",
      symbol: "AMD",
      would_have_executed: false,
      outcome: "SKIPPED",
      baseline_would_enter: false,
    }),
    row({
      ticket_id: "t6",
      symbol: "GOOG",
      would_have_executed: true,
      outcome: "WOULD_EXECUTE",
      baseline_would_enter: false,
    }),
  ];

  it("baselineWouldEnter prefers agent verdict over trigger flag", () => {
    assert.equal(baselineWouldEnter(row({ would_have_executed: false, outcome: "SKIPPED", baseline_would_enter: true, baseline_agent_enter: false })), false);
    assert.equal(baselineWouldEnter(row({ would_have_executed: false, outcome: "SKIPPED", baseline_would_enter: false })), false);
    assert.equal(baselineWouldEnter(row({ would_have_executed: false, outcome: "SKIPPED" })), null);
  });

  it("committeeOnlyBlocks lists baseline enter + committee deny", () => {
    const cases = committeeOnlyBlocks(fixture);
    assert.equal(cases.length, 2);
    assert.ok(cases.every((c) => c.baseline_would_enter && !c.committee_would_execute));
    assert.deepEqual(cases.map((c) => c.symbol).sort(), ["MSFT", "NVDA"]);
  });

  it("baselineOnlyEntries lists committee enter + baseline skip", () => {
    const cases = baselineOnlyEntries(fixture);
    assert.equal(cases.length, 2);
    assert.ok(cases.every((c) => !c.baseline_would_enter && c.committee_would_execute));
    assert.deepEqual(cases.map((c) => c.symbol).sort(), ["GOOG", "TSLA"]);
  });

  it("hardBlockAttribution counts block codes", () => {
    const attr = hardBlockAttribution(fixture);
    assert.ok(attr.some((a) => a.code === "KILL_SWITCH" && a.count === 1));
    assert.ok(attr.some((a) => a.code === "SOFT_RISK_DENY" && a.count === 1));
    assert.ok(attr[0]!.share_of_hard_blocks > 0);
  });

  it("compareDualTrack aggregates agree/disagree and case counts", () => {
    const summary = compareDualTrack(fixture);
    assert.equal(summary.total, 6);
    assert.equal(summary.dual_track.compared, 6);
    assert.equal(summary.dual_track.agree, 2);
    assert.equal(summary.dual_track.disagree, 4);
    assert.equal(summary.dual_track.committee_only_blocks, 2);
    assert.equal(summary.dual_track.baseline_only_entries, 2);
    assert.equal(summary.dual_track.committee_only_cases.length, 2);
    assert.equal(summary.dual_track.baseline_only_cases.length, 2);
    assert.ok(summary.dual_track.hard_block_attribution.length >= 2);
  });

  it("buildDualTrackReport is cron-safe pure output", () => {
    const report = buildDualTrackReport(fixture);
    assert.ok(report.generated_at);
    assert.equal(report.summary.dual_track.compared, 6);
    assert.ok(Array.isArray(report.skip_reasons));
    assert.ok(report.latency_ms.p50 != null);
  });
});
