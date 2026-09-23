import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  certificatePermitsExecution,
  enforceSoftRiskOpinion,
  opportunityTicketId,
  parseDebateSynthesis,
  parseOpportunityTicket,
  parseRiskCertificate,
  parseSoftRiskOpinion,
  snapCommitteeMultiplier,
  tightenStopForLong,
} from "../trading/committee";

const sampleTicket = {
  id: "abc123def4567890",
  symbol: "AAPL",
  asset_class: "STOCK" as const,
  strategy: "V2_SWING" as const,
  side: "LONG" as const,
  bar_time: "2026-09-23T16:00:00.000Z",
  entry: 100,
  stop: 95,
  target_menu: [{ price: 110, rr: 2, kind: "RESISTANCE" }],
  score: 72,
  features: { rsi: 58, macd_hist: -0.02 },
  regime: { daily_uptrend: true, adx: 24 },
  rationale_codes: ["BREAKOUT", "DAILY_UPTREND"],
};

describe("committee contracts — schema validation", () => {
  it("accepts a valid OpportunityTicket", () => {
    const r = parseOpportunityTicket(sampleTicket);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.symbol, "AAPL");
  });

  it("rejects ticket with RR below 2 in target menu", () => {
    const r = parseOpportunityTicket({ ...sampleTicket, target_menu: [{ price: 108, rr: 1.5, kind: "X" }] });
    assert.equal(r.ok, false);
  });

  it("rejects enforced SoftRiskOpinion when multiplier is not snapped", () => {
    const r = parseSoftRiskOpinion({
      allow: true,
      risk_multiplier: 0.9,
      stop_policy: "KEEP",
      reasons: [],
      red_flags: [],
    });
    assert.equal(r.ok, false);
  });

  it("accepts DebateSynthesis and RiskCertificate shapes", () => {
    const debate = parseDebateSynthesis({
      winner: "SPLIT",
      conviction: 2,
      bull_case: ["מomentum"],
      bear_case: ["overbought"],
      unresolved: ["earnings"],
      recommended_action: "SKIP",
    });
    assert.equal(debate.ok, true);

    const cert = parseRiskCertificate({
      ok: false,
      blocks: ["DAILY_LOSS_HALT"],
      final_qty: 0,
      final_entry: 100,
      final_stop: 95,
      final_target: 110,
      risk_r: 0,
      portfolio_heat_after: 3,
      market_state: "UNKNOWN",
    });
    assert.equal(cert.ok, true);
    if (cert.ok) assert.equal(certificatePermitsExecution(cert.data), false);
  });
});

describe("committee helpers — snap and stop tighten", () => {
  it("snapCommitteeMultiplier rounds DOWN to allowed set", () => {
    assert.equal(snapCommitteeMultiplier(1.8), 1);
    assert.equal(snapCommitteeMultiplier(0.9), 0.75);
    assert.equal(snapCommitteeMultiplier(0.6), 0.5);
    assert.equal(snapCommitteeMultiplier(0.3), 0);
    assert.equal(snapCommitteeMultiplier("bad"), 0);
  });

  it("tightenStopForLong only accepts stops closer to entry (LONG)", () => {
    const keep = tightenStopForLong({ entry: 100, structuralStop: 95, proposedStop: 94 });
    assert.equal(keep.stop, 95);
    assert.equal(keep.tightened, false);

    const ok = tightenStopForLong({ entry: 100, structuralStop: 95, proposedStop: 97 });
    assert.equal(ok.stop, 97);
    assert.equal(ok.tightened, true);

    const aboveEntry = tightenStopForLong({ entry: 100, structuralStop: 95, proposedStop: 101 });
    assert.equal(aboveEntry.stop, 95);
    assert.equal(aboveEntry.note, "STOP_NOT_BELOW_ENTRY");
  });

  it("enforceSoftRiskOpinion fail-closes on invalid schema", () => {
    const out = enforceSoftRiskOpinion({ allow: true, risk_multiplier: 2 }, { entry: 100, structuralStop: 95 });
    assert.equal(out.allow, false);
    assert.equal(out.risk_multiplier, 0);
    assert.ok(out.enforcement_notes.includes("FAIL_CLOSED_DENY"));
  });

  it("enforceSoftRiskOpinion snaps multiplier and rejects bad tighten", () => {
    const out = enforceSoftRiskOpinion(
      {
        allow: true,
        risk_multiplier: 1.2,
        stop_policy: "TIGHTEN",
        tightened_stop: 94,
        reasons: ["test"],
        red_flags: [],
      },
      { entry: 100, structuralStop: 95 },
    );
    assert.equal(out.risk_multiplier, 1);
    assert.equal(out.stop_policy, "KEEP");
    assert.ok(out.enforcement_notes.some((n) => n.startsWith("MULTIPLIER_SNAPPED")));
    assert.ok(out.enforcement_notes.includes("STOP_NOT_TIGHTER_THAN_STRUCTURAL"));
  });

  it("deny forces zero multiplier", () => {
    const out = enforceSoftRiskOpinion(
      { allow: false, risk_multiplier: 1, stop_policy: "KEEP", reasons: [], red_flags: [] },
      { entry: 100, structuralStop: 95 },
    );
    assert.equal(out.allow, false);
    assert.equal(out.risk_multiplier, 0);
  });
});

describe("committee helpers — ticket id", () => {
  it("opportunityTicketId is deterministic", () => {
    const a = opportunityTicketId("aapl", "V2_SWING", "2026-09-23T16:00:00.000Z");
    const b = opportunityTicketId("AAPL", "V2_SWING", "2026-09-23T16:00:00.000Z");
    const c = opportunityTicketId("AAPL", "DAILY_TREND", "2026-09-23T16:00:00.000Z");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 16);
  });
});

describe("committee helpers — RiskCertificate gate", () => {
  it("certificatePermitsExecution requires ok, OPEN, and qty > 0", () => {
    const open = {
      ok: true,
      blocks: [],
      final_qty: 10,
      final_entry: 100,
      final_stop: 95,
      final_target: 110,
      risk_r: 1,
      portfolio_heat_after: 2,
      market_state: "OPEN" as const,
    };
    assert.equal(certificatePermitsExecution(open), true);
    assert.equal(certificatePermitsExecution({ ...open, market_state: "UNKNOWN" }), false);
    assert.equal(certificatePermitsExecution({ ...open, ok: false, blocks: ["KILL_SWITCH"] }), false);
  });
});
