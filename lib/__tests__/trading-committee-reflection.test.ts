import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReflectionNote } from "../trading/committee/reflection";
import type { CommitteeRunResult } from "../trading/committee/runner";
import type { OpportunityTicket } from "../trading/committee/types";

const ticket: OpportunityTicket = {
  id: "abc123def4567890",
  symbol: "AAPL",
  asset_class: "STOCK",
  strategy: "V2_SWING",
  side: "LONG",
  bar_time: "2026-09-22T16:00:00.000Z",
  entry: 100,
  stop: 95,
  target_menu: [{ price: 110, rr: 2, kind: "2R" }],
  score: 80,
  features: { rsi: 55 },
  regime: {},
  rationale_codes: ["COMPRESSION"],
};

function baseRun(partial: Partial<CommitteeRunResult>): CommitteeRunResult {
  return {
    runId: "run001",
    ticket,
    status: "COMPLETED",
    outcome: "SKIPPED",
    shadow: true,
    wouldHaveExecuted: false,
    technical: null,
    fundamental: null,
    debate: null,
    softRisk: null,
    certificate: null,
    executionIntent: null,
    blocks: [],
    errors: [],
    injectionFlags: [],
    latencyMs: 1000,
    modelVersions: {},
    promptVersions: {},
    ...partial,
  };
}

describe("committee reflection builder", () => {
  it("buildReflectionNote is deterministic for same run", () => {
    const run = baseRun({
      outcome: "WOULD_EXECUTE",
      wouldHaveExecuted: true,
      debate: {
        winner: "BULL",
        conviction: 4,
        bull_case: ["trend"],
        bear_case: [],
        unresolved: [],
        recommended_action: "ENTER",
      },
    });
    const a = buildReflectionNote(run, 1_700_000_000_000);
    const b = buildReflectionNote(run, 1_700_000_000_000);
    assert.deepEqual(a, b);
    assert.equal(a.block_layer, "NONE");
    assert.equal(a.soft_vs_hard, "none");
    assert.equal(a.debate_tilt, "BULL");
    assert.ok(a.tags.includes("debate:bull"));
  });

  it("attributes HARD block layer from certificate blocks", () => {
    const run = baseRun({
      outcome: "BLOCKED",
      blocks: ["DAILY_HALT"],
      certificate: {
        ok: false,
        blocks: ["DAILY_HALT"],
        final_qty: 0,
        final_entry: 100,
        final_stop: 95,
        final_target: 110,
        risk_r: 0,
        portfolio_heat_after: 0,
        market_state: "OPEN",
      },
    });
    const note = buildReflectionNote(run);
    assert.equal(note.block_layer, "HARD");
    assert.equal(note.soft_vs_hard, "hard");
    assert.deepEqual(note.block_codes, ["DAILY_HALT"]);
    assert.ok(note.tags.includes("block:daily_halt"));
  });

  it("attributes SOFT block when soft risk denies", () => {
    const run = baseRun({
      outcome: "SKIPPED",
      softRisk: {
        allow: false,
        risk_multiplier: 0,
        stop_policy: "KEEP",
        reasons: ["crowded book"],
        red_flags: ["vix spike"],
        enforcement_notes: [],
      },
      certificate: {
        ok: false,
        blocks: ["SOFT_RISK_DENY"],
        final_qty: 0,
        final_entry: 100,
        final_stop: 95,
        final_target: 110,
        risk_r: 0,
        portfolio_heat_after: 0,
        market_state: "OPEN",
      },
    });
    const note = buildReflectionNote(run);
    assert.equal(note.block_layer, "SOFT");
    assert.equal(note.soft_vs_hard, "soft");
    assert.equal(note.soft_summary?.allow, false);
    assert.ok(note.tags.includes("soft:deny"));
  });

  it("attributes DEBATE block when debate recommends SKIP without soft deny", () => {
    const run = baseRun({
      outcome: "SKIPPED",
      debate: {
        winner: "SPLIT",
        conviction: 2,
        bull_case: [],
        bear_case: ["weak RS"],
        unresolved: ["earnings"],
        recommended_action: "SKIP",
      },
      certificate: {
        ok: false,
        blocks: ["DEBATE_SKIP"],
        final_qty: 0,
        final_entry: 100,
        final_stop: 95,
        final_target: 110,
        risk_r: 0,
        portfolio_heat_after: 0,
        market_state: "OPEN",
      },
    });
    const note = buildReflectionNote(run);
    assert.equal(note.block_layer, "DEBATE");
    assert.equal(note.soft_vs_hard, "none");
    assert.equal(note.debate_tilt, "SPLIT");
    assert.equal(note.debate_recommended_action, "SKIP");
  });

  it("attributes ERROR layer on pipeline failure", () => {
    const run = baseRun({
      status: "TIMEOUT",
      outcome: "ERROR",
      errors: ["COMMITTEE_TIMEOUT"],
    });
    const note = buildReflectionNote(run);
    assert.equal(note.block_layer, "ERROR");
    assert.equal(note.soft_vs_hard, "error");
    assert.ok(note.tags.includes("layer:error"));
  });

  it("reflection id is stable hash of run_id", () => {
    const run = baseRun({ runId: "stable-run-id" });
    const note = buildReflectionNote(run);
    assert.equal(note.id.length, 16);
    assert.equal(note.run_id, "stable-run-id");
    assert.equal(buildReflectionNote(run).id, note.id);
  });
});
