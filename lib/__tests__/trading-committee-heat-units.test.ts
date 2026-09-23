import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { issueRiskCertificate, envelopeFromAccount } from "../trading/committee/hard-risk";
import { enforceSoftRiskOpinion } from "../trading/committee/helpers";
import { opportunityTicketId } from "../trading/committee/ids";
import { checkNewEntry } from "../trading/risk-envelope";
import { RISK_ENVELOPE } from "../trading/config";
import type { DebateSynthesis, OpportunityTicket } from "../trading/committee/types";
import type { SimPosition } from "../trading/position";

const BAR_TIME = "2026-09-23T16:00:00.000Z";

function ticket(): OpportunityTicket {
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
    features: {},
    regime: {},
    rationale_codes: ["TEST"],
  };
}

const debate: DebateSynthesis = {
  winner: "BULL",
  conviction: 4,
  bull_case: ["up"],
  bear_case: ["down"],
  unresolved: [],
  recommended_action: "ENTER",
};

const openPosition = (symbol: string): { symbol: string; entry_limit: number; remaining_size: number; sim_state: SimPosition } => ({
  symbol,
  entry_limit: 50,
  remaining_size: 10,
  sim_state: { state: "OPEN", entry_price: 50, stop_price: 48 } as SimPosition,
});

function certFor(riskScale: number, openSymbols: string[]) {
  const envelope = envelopeFromAccount({
    equity: 100_000,
    peakEquity: 100_000,
    realizedToday: 0,
    realizedWeek: 0,
    killSwitchActive: false,
    entriesPaused: false,
    openPositions: openSymbols.map(openPosition),
  });
  const result = issueRiskCertificate({
    ticket: ticket(),
    assetClass: "STOCK",
    envelope,
    vetoes: [],
    envelopeBlocks: [],
    softRisk: enforceSoftRiskOpinion(
      { allow: true, risk_multiplier: 1, stop_policy: "KEEP", reasons: [], red_flags: [] },
      { entry: 100, structuralStop: 95 },
    ),
    debate,
    equity: 100_000,
    riskScale,
  });
  assert.ok(result.ok, `certificate should parse: ${result.ok ? "" : result.error}`);
  return result.data;
}

/**
 * `openRiskR` returns **1 R per at-risk open position** — a position carries
 * exactly one of its own R, which is why `checkNewEntry` budgets the candidate
 * as `openRisk + 1` against `MAX_TOTAL_OPEN_RISK_R`.
 *
 * The certificate summed that with `plan.risk_amount / (MAX_RISK_PER_TRADE ×
 * equity)` — a *fraction of the per-trade cap*, not R. The two agree only at
 * full risk scale. At half scale the certificate reported the new trade as
 * 0.5 heat, while the same position reports 1 the moment it opens, so
 * `portfolio_heat_after` was not comparable to the limit it looks like it
 * should be compared to.
 */
describe("portfolio_heat_after is in R, like the envelope", () => {
  it("counts the candidate as one R regardless of risk scale", () => {
    const full = certFor(1, ["BTC", "ETH"]);
    const half = certFor(0.5, ["BTC", "ETH"]);
    assert.equal(full.portfolio_heat_after, 3, "2 open + the candidate");
    assert.equal(
      half.portfolio_heat_after,
      3,
      "a smaller position still occupies one R slot once it opens"
    );
  });

  it("agrees with what checkNewEntry budgets against MAX_TOTAL_OPEN_RISK_R", () => {
    const openSymbols = ["BTC", "ETH", "SOL"];
    const cert = certFor(1, openSymbols);
    const envelopeOpenRisk = openSymbols.length; // openRiskR = 1 each
    assert.equal(cert.portfolio_heat_after, envelopeOpenRisk + 1);
    assert.ok(
      cert.portfolio_heat_after <= RISK_ENVELOPE.MAX_TOTAL_OPEN_RISK_R,
      "and is on the same scale as the limit"
    );
  });

  it("matches the envelope's own verdict at the boundary", () => {
    const many = Array.from({ length: RISK_ENVELOPE.MAX_TOTAL_OPEN_RISK_R }, (_, i) => `S${i}`);
    const envelope = envelopeFromAccount({
      equity: 100_000,
      peakEquity: 100_000,
      realizedToday: 0,
      realizedWeek: 0,
      killSwitchActive: false,
      entriesPaused: false,
      openPositions: many.map(openPosition),
    });
    // The envelope refuses this candidate; the certificate's heat figure must
    // show why rather than reporting a number below the limit.
    assert.ok(checkNewEntry(envelope, "AAPL", []).includes("MAX_OPEN_RISK"));
    const cert = certFor(1, many);
    assert.ok(
      cert.portfolio_heat_after > RISK_ENVELOPE.MAX_TOTAL_OPEN_RISK_R,
      `heat ${cert.portfolio_heat_after} must exceed the limit the envelope just enforced`
    );
  });

  it("still reports how much of the per-trade budget the plan used", () => {
    const full = certFor(1, []);
    const half = certFor(0.5, []);
    assert.ok(
      half.risk_budget_fraction! < full.risk_budget_fraction!,
      "a half-scale plan uses less of the per-trade cap"
    );
    assert.ok(full.risk_budget_fraction! > 0);
  });

  it("reports no heat contribution when there is no plan", () => {
    const envelope = envelopeFromAccount({
      equity: 100_000,
      peakEquity: 100_000,
      realizedToday: 0,
      realizedWeek: 0,
      killSwitchActive: false,
      entriesPaused: false,
      openPositions: [openPosition("BTC")],
    });
    const result = issueRiskCertificate({
      ticket: ticket(),
      assetClass: "STOCK",
      envelope,
      vetoes: [],
      envelopeBlocks: [],
      softRisk: enforceSoftRiskOpinion(
      { allow: true, risk_multiplier: 1, stop_policy: "KEEP", reasons: [], red_flags: [] },
      { entry: 100, structuralStop: 95 },
    ),
      debate,
      equity: 100_000,
      riskScale: 1,
      maxNotional: 0, // no buying power → no plan
    });
    assert.ok(result.ok);
    assert.equal(result.data.portfolio_heat_after, 1, "only the already-open position");
    assert.equal(result.data.risk_r, 0);
  });
});
