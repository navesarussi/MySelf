import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMMITTEE_FEATURE_KEYS,
  certificatePermitsExecution,
  checkOpportunityTicketInvariants,
  checkRiskCertificateInvariants,
  debateDefaultAction,
  enforceSoftRiskOpinion,
  opportunityTicketId,
  parseAnalystReport,
  parseDebateSynthesis,
  parseExecutionIntent,
  parseOpportunityTicket,
  parseRiskCertificate,
  parseSoftRiskOpinion,
  snapCommitteeMultiplier,
  tightenStopForLong,
} from "../trading/committee";

const BAR_TIME = "2026-09-23T16:00:00.000Z";

function makeTicket(overrides: Record<string, unknown> = {}) {
  const base = {
    symbol: "AAPL",
    asset_class: "STOCK" as const,
    strategy: "V2_SWING" as const,
    side: "LONG" as const,
    bar_time: BAR_TIME,
    entry: 100,
    stop: 95,
    target_menu: [{ price: 110, rr: 2, kind: "RESISTANCE" }],
    score: 72,
    features: { rsi: 58, macd_hist: -0.02 },
    regime: { daily_uptrend: true, adx: 24 },
    rationale_codes: ["BREAKOUT", "DAILY_UPTREND"],
  };
  const merged = { ...base, ...overrides };
  const id = opportunityTicketId(String(merged.symbol), String(merged.strategy), String(merged.bar_time));
  return { ...merged, id };
}

describe("committee contracts — OpportunityTicket", () => {
  it("accepts a valid ticket with matching deterministic id", () => {
    const r = parseOpportunityTicket(makeTicket());
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.id, opportunityTicketId("AAPL", "V2_SWING", BAR_TIME));
  });

  it("rejects id mismatch vs symbol/strategy/bar_time", () => {
    const ticket = { ...makeTicket(), id: "deadbeefdeadbeef" };
    const r = parseOpportunityTicket(ticket);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /id mismatch/);
  });

  it("rejects stop at or above entry (LONG geometry)", () => {
    const r = parseOpportunityTicket(makeTicket({ stop: 100 }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /stop must be below entry/);
  });

  it("rejects target_menu RR inconsistent with price geometry", () => {
    const r = parseOpportunityTicket(makeTicket({ target_menu: [{ price: 108, rr: 2, kind: "X" }] }));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /rr/);
  });

  it("rejects schema-level RR below 2", () => {
    const t = makeTicket({ target_menu: [{ price: 109, rr: 1.5, kind: "X" }] });
    const r = parseOpportunityTicket(t);
    assert.equal(r.ok, false);
  });
});

describe("committee contracts — AnalystReport & DebateSynthesis", () => {
  it("accepts AnalystReport with Hebrew key_points", () => {
    const r = parseAnalystReport({
      role: "TECHNICAL",
      symbol: "AAPL",
      stance: "BULLISH",
      confidence: 4,
      key_points: ["מomentum חיובי", "ADX עולה"],
      evidence: [{ source: "ticket.features", ref: "rsi=58" }],
      risks: ["RSI גבוה"],
      horizon: "SWING",
      model: "gemini-test",
      prompt_version: "technical-v0",
    });
    assert.equal(r.ok, true);
  });

  it("rejects AnalystReport with too many key_points", () => {
    const r = parseAnalystReport({
      role: "TECHNICAL",
      symbol: "AAPL",
      stance: "NEUTRAL",
      confidence: 3,
      key_points: ["a", "b", "c", "d", "e", "f", "g"],
      evidence: [],
      risks: [],
      horizon: "SWING",
      model: "x",
      prompt_version: "v0",
    });
    assert.equal(r.ok, false);
  });

  it("debateDefaultAction conservatively skips SPLIT with low conviction", () => {
    assert.equal(
      debateDefaultAction({
        winner: "SPLIT",
        conviction: 2,
        bull_case: [],
        bear_case: [],
        unresolved: [],
        recommended_action: "ENTER",
      }),
      "SKIP",
    );
    assert.equal(
      debateDefaultAction({
        winner: "BULL",
        conviction: 4,
        bull_case: [],
        bear_case: [],
        unresolved: [],
        recommended_action: "ENTER",
      }),
      "ENTER",
    );
  });

  it("parseDebateSynthesis accepts valid synthesis", () => {
    const r = parseDebateSynthesis({
      winner: "BEAR",
      conviction: 4,
      bull_case: ["x"],
      bear_case: ["y"],
      unresolved: [],
      recommended_action: "SKIP",
    });
    assert.equal(r.ok, true);
  });
});

describe("committee contracts — SoftRiskOpinion", () => {
  it("rejects enforced form when multiplier is not in allowed set", () => {
    const r = parseSoftRiskOpinion({
      allow: true,
      risk_multiplier: 0.9,
      stop_policy: "KEEP",
      reasons: [],
      red_flags: [],
    });
    assert.equal(r.ok, false);
  });

  it("enforceSoftRiskOpinion fail-closes on invalid schema", () => {
    const out = enforceSoftRiskOpinion({ allow: true, risk_multiplier: 2 }, { entry: 100, structuralStop: 95 });
    assert.equal(out.allow, false);
    assert.equal(out.risk_multiplier, 0);
    assert.ok(out.enforcement_notes.includes("FAIL_CLOSED_DENY"));
  });

  it("enforceSoftRiskOpinion snaps multiplier and accepts valid tighten", () => {
    const snapped = enforceSoftRiskOpinion(
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
    assert.equal(snapped.risk_multiplier, 1);
    assert.equal(snapped.stop_policy, "KEEP");
    assert.ok(snapped.enforcement_notes.some((n) => n.startsWith("MULTIPLIER_SNAPPED")));
    assert.ok(snapped.enforcement_notes.includes("STOP_NOT_TIGHTER_THAN_STRUCTURAL"));

    const tightened = enforceSoftRiskOpinion(
      {
        allow: true,
        risk_multiplier: 0.75,
        stop_policy: "TIGHTEN",
        tightened_stop: 97,
        reasons: [],
        red_flags: [],
      },
      { entry: 100, structuralStop: 95 },
    );
    assert.equal(tightened.allow, true);
    assert.equal(tightened.stop_policy, "TIGHTEN");
    assert.equal(tightened.tightened_stop, 97);
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

describe("committee contracts — RiskCertificate & ExecutionIntent", () => {
  const approvedCert = {
    ok: true,
    blocks: [] as string[],
    final_qty: 10,
    final_entry: 100,
    final_stop: 95,
    final_target: 110,
    risk_r: 1,
    portfolio_heat_after: 2,
    market_state: "OPEN" as const,
  };

  it("rejects ok certificate when market_state is UNKNOWN", () => {
    const r = parseRiskCertificate({ ...approvedCert, market_state: "UNKNOWN" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /UNKNOWN/);
  });

  it("rejects ok certificate with invalid LONG geometry", () => {
    const r = parseRiskCertificate({ ...approvedCert, final_stop: 101 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /final_stop/);
  });

  it("accepts blocked certificate with UNKNOWN market", () => {
    const r = parseRiskCertificate({
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
    assert.equal(r.ok, true);
  });

  it("certificatePermitsExecution requires invariants + OPEN + qty", () => {
    assert.equal(certificatePermitsExecution(approvedCert), true);
    assert.equal(certificatePermitsExecution({ ...approvedCert, market_state: "CLOSED" }), false);
    assert.equal(certificatePermitsExecution({ ...approvedCert, ok: false, blocks: ["KILL_SWITCH"] }), false);
    assert.equal(certificatePermitsExecution({ ...approvedCert, final_qty: 0 }), false);
  });

  it("parseExecutionIntent requires limit_price for LIMIT orders", () => {
    const base = {
      ticket_id: "abc123456789abcd",
      certificate_id: "cert123456789abc",
      broker: "ALPACA_PAPER" as const,
      qty: 5,
      stop: 95,
      target: 110,
      client_order_id: "client-order-001",
      audit_ref: "audit-ref-001",
    };
    assert.equal(parseExecutionIntent({ ...base, order_type: "LIMIT" }).ok, false);
    assert.equal(parseExecutionIntent({ ...base, order_type: "LIMIT", limit_price: 100 }).ok, true);
    assert.equal(parseExecutionIntent({ ...base, order_type: "MARKET" }).ok, true);
    assert.equal(parseExecutionIntent({ ...base, order_type: "MARKET", limit_price: 100 }).ok, false);
  });
});

describe("committee helpers — snap, stop, id", () => {
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

  it("opportunityTicketId is deterministic and case-normalized on symbol", () => {
    const a = opportunityTicketId("aapl", "V2_SWING", BAR_TIME);
    const b = opportunityTicketId("AAPL", "V2_SWING", BAR_TIME);
    const c = opportunityTicketId("AAPL", "DAILY_TREND", BAR_TIME);
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(a.length, 16);
  });

  it("COMMITTEE_FEATURE_KEYS documents expected deterministic features", () => {
    assert.ok(COMMITTEE_FEATURE_KEYS.includes("rsi"));
    assert.ok(COMMITTEE_FEATURE_KEYS.includes("macd_hist"));
  });

  it("invariant helpers can be used independently of parsers", () => {
    const ticket = makeTicket();
    const parsed = parseOpportunityTicket(ticket);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(checkOpportunityTicketInvariants(parsed.data).ok, true);
    assert.equal(checkRiskCertificateInvariants({ ...approvedCertFromTest() }).ok, true);
  });
});

function approvedCertFromTest() {
  return {
    ok: true,
    blocks: [] as string[],
    final_qty: 10,
    final_entry: 100,
    final_stop: 95,
    final_target: 110,
    risk_r: 1,
    portfolio_heat_after: 2,
    market_state: "OPEN" as const,
  };
}
