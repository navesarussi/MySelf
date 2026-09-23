import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { opportunityTicketId } from "../trading/committee/ids";
import { issueRiskCertificate, envelopeFromAccount } from "../trading/committee/hard-risk";
import { runCommitteeShadow } from "../trading/committee/runner";
import type { CommitteeLlmClient } from "../trading/committee/llm";
import {
  analystReportSchema,
  debateSynthesisSchema,
  rawSoftRiskOpinionSchema,
  type OpportunityTicket,
} from "../trading/committee/types";
import { enforceSoftRiskOpinion } from "../trading/committee/helpers";
import { assertCertificateAllowsExecution } from "../trading/committee/gate";

const BAR_TIME = "2026-09-23T16:00:00.000Z";

function makeTicket(overrides: Partial<OpportunityTicket> = {}): OpportunityTicket {
  const base = {
    symbol: "AAPL",
    asset_class: "STOCK" as const,
    strategy: "DAILY_TREND" as const,
    side: "LONG" as const,
    bar_time: BAR_TIME,
    entry: 100,
    stop: 95,
    target_menu: [{ price: 110, rr: 2, kind: "STRUCTURAL" }],
    score: 80,
    features: { rsi: 55, macd_hist: 0.1 },
    regime: { daily_uptrend: true },
    rationale_codes: ["DAILY_BREAKOUT"],
  };
  const merged = { ...base, ...overrides };
  return { ...merged, id: opportunityTicketId(merged.symbol, merged.strategy, merged.bar_time) };
}

function mockLlmQueue(responses: Array<{ ok: true; data: unknown } | { ok: false; error: string }>): CommitteeLlmClient {
  let i = 0;
  return {
    async generateObject<T>({ schema }: { system: string; prompt: string; schema: z.ZodType<T>; timeoutMs: number }) {
      const next = responses[i++];
      if (!next) return { ok: false, error: "unexpected_llm_call" };
      if (!next.ok) return next;
      const parsed = schema.safeParse(next.data);
      if (!parsed.success) return { ok: false, error: "schema_violation" };
      return { ok: true, data: parsed.data };
    },
  };
}

const technical = {
  role: "TECHNICAL" as const,
  symbol: "AAPL",
  stance: "BULLISH" as const,
  confidence: 4 as const,
  key_points: ["momentum"],
  evidence: [{ source: "ticket.features", ref: "rsi=55" }],
  risks: [],
  horizon: "SWING" as const,
  model: "mock",
  prompt_version: "t-v1",
};

const fundamental = {
  role: "FUNDAMENTAL_NEWS" as const,
  symbol: "AAPL",
  stance: "NEUTRAL" as const,
  confidence: 2 as const,
  key_points: ["NO_HEADLINES — data gap"],
  evidence: [],
  risks: ["thin news feed"],
  horizon: "SWING" as const,
  model: "mock",
  prompt_version: "f-v1",
};

const debate = {
  winner: "BULL" as const,
  conviction: 4 as const,
  bull_case: ["breakout"],
  bear_case: ["extended"],
  unresolved: [],
  recommended_action: "ENTER" as const,
};

const softAllow = {
  allow: true,
  risk_multiplier: 1,
  stop_policy: "KEEP" as const,
  reasons: ["ok"],
  red_flags: [],
};

function baseRunInput(llm: CommitteeLlmClient) {
  return {
    ticket: makeTicket(),
    assetClass: "STOCK" as const,
    envelope: envelopeFromAccount({
      equity: 100_000,
      peakEquity: 100_000,
      realizedToday: 0,
      realizedWeek: 0,
      killSwitchActive: false,
      entriesPaused: false,
      openPositions: [],
    }),
    vetoes: [] as string[],
    envelopeBlocks: [] as string[],
    equity: 100_000,
    riskScale: 1,
    shadow: true,
    llm,
    fundamental: { headlines: [], vix: 18, btc_dominance_pct: 52, funding_rate: null, earnings_window: false },
    portfolio: { open_risk_r: 0, realized_r_today: 0, realized_r_week: 0, drawdown_pct: 0, open_positions: [] },
  };
}

describe("committee hard risk — issueRiskCertificate", () => {
  it("blocks when envelope has KILL_SWITCH", () => {
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
      softRisk: enforceSoftRiskOpinion(softAllow, { entry: 100, structuralStop: 95 }),
      debate,
      equity: 50_000,
      riskScale: 1,
    });
    assert.equal(cert.ok, true);
    if (cert.ok) {
      assert.equal(cert.data.ok, false);
      assert.ok(cert.data.blocks.includes("KILL_SWITCH"));
    }
  });

  it("blocks MARKET_CLOSED via market_state", () => {
    const cert = issueRiskCertificate({
      ticket: makeTicket(),
      assetClass: "STOCK",
      envelope: envelopeFromAccount({
        equity: 100_000,
        peakEquity: 100_000,
        realizedToday: 0,
        realizedWeek: 0,
        killSwitchActive: false,
        entriesPaused: false,
        openPositions: [],
      }),
      vetoes: ["MARKET_CLOSED"],
      envelopeBlocks: [],
      softRisk: enforceSoftRiskOpinion(softAllow, { entry: 100, structuralStop: 95 }),
      debate,
      equity: 100_000,
      riskScale: 1,
    });
    assert.equal(cert.ok, true);
    if (cert.ok) {
      assert.equal(cert.data.ok, false);
      assert.equal(cert.data.market_state, "CLOSED");
    }
  });
});

describe("committee shadow runner", () => {
  it("fail-closes when technical analyst schema fails", async () => {
    const llm = mockLlmQueue([{ ok: false, error: "schema_violation" }]);
    const result = await runCommitteeShadow(baseRunInput(llm));
    assert.equal(result.status, "FAILED");
    assert.equal(result.outcome, "ERROR");
    assert.equal(result.wouldHaveExecuted, false);
    assert.equal(result.executionIntent, null);
  });

  it("fail-closes on LLM timeout error", async () => {
    const llm = mockLlmQueue([{ ok: false, error: "COMMITTEE_TIMEOUT" }]);
    const result = await runCommitteeShadow(baseRunInput(llm));
    assert.equal(result.status, "TIMEOUT");
    assert.equal(result.wouldHaveExecuted, false);
  });

  it("completes happy path with wouldHaveExecuted in shadow (no broker)", async () => {
    const llm = mockLlmQueue([
      { ok: true, data: technical },
      { ok: true, data: fundamental },
      { ok: true, data: { points: ["bull"] } },
      { ok: true, data: { points: ["bear"] } },
      { ok: true, data: debate },
      { ok: true, data: softAllow },
    ]);
    const result = await runCommitteeShadow(baseRunInput(llm));
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.shadow, true);
    assert.equal(result.wouldHaveExecuted, true);
    assert.ok(result.executionIntent);
    assert.equal(result.executionIntent!.broker, "ALPACA_PAPER");
    assert.ok(analystReportSchema.safeParse(result.technical).success);
    assert.ok(debateSynthesisSchema.safeParse(result.debate).success);
    assert.ok(rawSoftRiskOpinionSchema.safeParse({ ...softAllow, risk_multiplier: result.softRisk!.risk_multiplier }).success);
  });

  it("shadow mode records would_have_executed without broker submission path", async () => {
    const llm = mockLlmQueue([
      { ok: true, data: technical },
      { ok: true, data: fundamental },
      { ok: true, data: { points: ["bull"] } },
      { ok: true, data: { points: ["bear"] } },
      { ok: true, data: debate },
      { ok: true, data: softAllow },
    ]);
    const result = await runCommitteeShadow({ ...baseRunInput(llm), shadow: true });
    assert.equal(result.wouldHaveExecuted, true);
    assert.equal(result.shadow, true);
    assert.ok(result.executionIntent);
    assert.ok(!("broker_order_id" in result));
  });

  it("never would_have_executed when certificate is expired at gate", async () => {
    const llm = mockLlmQueue([
      { ok: true, data: technical },
      { ok: true, data: fundamental },
      { ok: true, data: { points: ["bull"] } },
      { ok: true, data: { points: ["bear"] } },
      { ok: true, data: debate },
      { ok: true, data: softAllow },
    ]);
    const result = await runCommitteeShadow(baseRunInput(llm));
    assert.ok(result.certificate);
    const stale = { ...result.certificate!, issued_at: new Date(Date.now() - 600_000).toISOString() };
    const gate = assertCertificateAllowsExecution(stale, {
      ticket: result.ticket,
      intent: result.executionIntent ?? undefined,
      nowMs: Date.now(),
      maxAgeMs: 60_000,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reason, "CERTIFICATE_EXPIRED");
  });

  it("hard risk blocks execution when soft risk denies", async () => {
    const llm = mockLlmQueue([
      { ok: true, data: technical },
      { ok: true, data: fundamental },
      { ok: true, data: { points: ["bull"] } },
      { ok: true, data: { points: ["bear"] } },
      { ok: true, data: debate },
      { ok: true, data: { allow: false, risk_multiplier: 0, stop_policy: "KEEP", reasons: ["too hot"], red_flags: [] } },
    ]);
    const result = await runCommitteeShadow(baseRunInput(llm));
    assert.equal(result.wouldHaveExecuted, false);
    assert.equal(result.executionIntent, null);
    assert.ok(result.certificate);
    assert.equal(result.certificate!.ok, false);
    assert.ok(result.blocks.includes("SOFT_RISK_DENY"));
  });

  it("audit row shape matches store contract", async () => {
    const llm = mockLlmQueue([
      { ok: true, data: technical },
      { ok: true, data: fundamental },
      { ok: true, data: { points: ["bull"] } },
      { ok: true, data: { points: ["bear"] } },
      { ok: true, data: debate },
      { ok: true, data: softAllow },
    ]);
    const result = await runCommitteeShadow(baseRunInput(llm));
    const row = {
      id: result.runId,
      ticket_id: result.ticket.id,
      symbol: result.ticket.symbol,
      strategy: result.ticket.strategy,
      bar_time: result.ticket.bar_time,
      shadow: result.shadow,
      status: result.status,
      outcome: result.outcome,
      would_have_executed: result.wouldHaveExecuted,
      blocks: result.blocks,
      errors: result.errors,
      latency_ms: result.latencyMs,
      model_versions: result.modelVersions,
      prompt_versions: result.promptVersions,
    };
    assert.equal(typeof row.id, "string");
    assert.equal(row.ticket_id.length, 16);
    assert.equal(row.shadow, true);
    assert.ok(["COMPLETED", "FAILED", "TIMEOUT", "SKIP"].includes(row.status));
    assert.ok(["WOULD_EXECUTE", "BLOCKED", "SKIPPED", "ERROR"].includes(row.outcome));
    assert.equal(typeof row.latency_ms, "number");
  });
});
