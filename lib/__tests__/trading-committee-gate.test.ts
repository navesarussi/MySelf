import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { opportunityTicketId } from "../trading/committee/ids";
import { assertCertificateAllowsExecution } from "../trading/committee/gate";
import { buildExecutionIntent, buildCommitteeExecutionIntent } from "../trading/committee/execution";
import { issueRiskCertificate, envelopeFromAccount } from "../trading/committee/hard-risk";
import { enforceSoftRiskOpinion } from "../trading/committee/helpers";
import type { OpportunityTicket, RiskCertificate } from "../trading/committee/types";

const BAR_TIME = "2026-09-23T16:00:00.000Z";

function makeTicket(): OpportunityTicket {
  return {
    id: opportunityTicketId("AAPL", "DAILY_TREND", BAR_TIME),
    symbol: "AAPL",
    asset_class: "STOCK",
    strategy: "DAILY_TREND",
    side: "LONG",
    bar_time: BAR_TIME,
    entry: 100,
    stop: 95,
    target_menu: [{ price: 110, rr: 2, kind: "STRUCTURAL" }],
    score: 80,
    features: { rsi: 55 },
    regime: {},
    rationale_codes: ["TEST"],
  };
}

function approvedCert(overrides: Partial<RiskCertificate> = {}): RiskCertificate {
  return {
    ok: true,
    blocks: [],
    final_qty: 10,
    final_entry: 100,
    final_stop: 95,
    final_target: 110,
    risk_r: 1,
    portfolio_heat_after: 2,
    market_state: "OPEN",
    issued_at: new Date().toISOString(),
    ...overrides,
  };
}

const debate = {
  winner: "BULL" as const,
  conviction: 4 as const,
  bull_case: [],
  bear_case: [],
  unresolved: [],
  recommended_action: "ENTER" as const,
};

const softAllow = enforceSoftRiskOpinion(
  { allow: true, risk_multiplier: 1, stop_policy: "KEEP", reasons: [], red_flags: [] },
  { entry: 100, structuralStop: 95 },
);

describe("committee hard-risk gate", () => {
  it("rejects missing certificate", () => {
    const gate = assertCertificateAllowsExecution(null, { ticket: makeTicket() });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "CERTIFICATE_MISSING");
  });

  it("rejects denied certificate (envelope veto)", () => {
    const cert = issueRiskCertificate({
      ticket: makeTicket(),
      assetClass: "STOCK",
      envelope: envelopeFromAccount({
        equity: 50_000,
        peakEquity: 100_000,
        realizedToday: 0,
        realizedWeek: 0,
        killSwitchActive: true,
        entriesPaused: false,
        openPositions: [],
      }),
      vetoes: [],
      envelopeBlocks: ["KILL_SWITCH"],
      softRisk: softAllow,
      debate,
      equity: 50_000,
      riskScale: 1,
    });
    assert.equal(cert.ok, true);
    if (cert.ok) {
      assert.equal(cert.data.ok, false);
      const gate = assertCertificateAllowsExecution(cert.data, { ticket: makeTicket() });
      assert.equal(gate.ok, false);
      if (!gate.ok) assert.equal(gate.reason, "KILL_SWITCH");
    }
  });

  it("rejects expired certificate", () => {
    const ticket = makeTicket();
    const cert = approvedCert({ issued_at: new Date(Date.now() - 600_000).toISOString() });
    const gate = assertCertificateAllowsExecution(cert, { ticket, nowMs: Date.now(), maxAgeMs: 60_000 });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "CERTIFICATE_EXPIRED");
  });

  it("soft risk allow cannot override hard deny", () => {
    const ticket = makeTicket();
    const cert = approvedCert({ ok: false, blocks: ["SOFT_RISK_DENY"], final_qty: 0 });
    const gate = assertCertificateAllowsExecution(cert, { ticket });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "SOFT_RISK_DENY");
  });

  it("buildExecutionIntent refuses without permitting certificate", () => {
    const ticket = makeTicket();
    const intent = buildExecutionIntent({
      ticket,
      certificate: approvedCert({ ok: false, blocks: ["DAILY_LOSS_HALT"], final_qty: 0 }),
      auditRef: "audit123456789012",
      broker: "ALPACA_PAPER",
    });
    assert.equal(intent.ok, false);
    if (!intent.ok) assert.match(intent.error, /DAILY_LOSS_HALT|CERTIFICATE_DENIED/);
  });

  it("buildCommitteeExecutionIntent passes gate on valid certificate", () => {
    const ticket = makeTicket();
    const cert = approvedCert();
    const intent = buildCommitteeExecutionIntent({ ticket, certificate: cert, auditRef: "audit123456789012" });
    assert.equal(intent.ok, true);
    if (intent.ok) {
      const gate = assertCertificateAllowsExecution(cert, { ticket, intent: intent.data });
      assert.equal(gate.ok, true);
    }
  });

  it("rejects intent that does not match certificate fields", () => {
    const ticket = makeTicket();
    const cert = approvedCert();
    const intentR = buildExecutionIntent({ ticket, certificate: cert, auditRef: "audit123456789012", broker: "ALPACA_PAPER" });
    assert.equal(intentR.ok, true);
    if (intentR.ok) {
      const tampered = { ...intentR.data, qty: intentR.data.qty + 1 };
      const gate = assertCertificateAllowsExecution(cert, { ticket, intent: tampered });
      assert.equal(gate.ok, false);
      if (!gate.ok) assert.equal(gate.reason, "INTENT_QTY_MISMATCH");
    }
  });
});
