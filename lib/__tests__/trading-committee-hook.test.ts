import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { opportunityTicketId } from "../trading/committee/ids";
import { buildCommitteeErrorRun, runCommitteeShadowBatch, type CommitteeHookItem } from "../trading/committee/hook";
import type { CommitteeRunResult } from "../trading/committee/runner";
import type { CommitteeHookContext } from "../trading/committee/hook";
import type { OpportunityTicket } from "../trading/committee/types";

const BAR_TIME = "2026-09-23T16:00:00.000Z";

function makeTicket(score = 80): OpportunityTicket {
  const base = {
    symbol: "AAPL",
    asset_class: "STOCK" as const,
    strategy: "DAILY_TREND" as const,
    side: "LONG" as const,
    bar_time: BAR_TIME,
    entry: 100,
    stop: 95,
    target_menu: [{ price: 110, rr: 2, kind: "STRUCTURAL" }],
    score,
    features: { rsi: 55 },
    regime: { daily_uptrend: true },
    rationale_codes: ["TEST"],
  };
  return { ...base, id: opportunityTicketId(base.symbol, base.strategy, base.bar_time) };
}

const hookItem = (ticket: OpportunityTicket): CommitteeHookItem => ({
  ticket,
  assetClass: "STOCK",
  vetoes: [],
  envelopeBlocks: [],
  triggerId: "00000000-0000-0000-0000-000000000001",
});

const hookCtx = {
  settings: {
    peak_equity: 100_000,
    risk_scale: 1,
    kill_switch_active: false,
    entries_paused: false,
    phase: "PAPER",
    agent_enabled: true,
  },
  account: {
    equity: 100_000,
    realizedToday: 0,
    realizedWeek: 0,
    open: [],
  },
  vix: 18,
  btc_dominance_pct: 52,
  summary: { errors: [] as string[] },
} as unknown as CommitteeHookContext;

describe("committee hook resilience", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.COMMITTEE_ENABLED = "true";
    process.env.COMMITTEE_SHADOW = "true";
    process.env.COMMITTEE_DRY_RUN_LLM = "true";
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("buildCommitteeErrorRun is fail-closed ERROR with no intent", () => {
    const result = buildCommitteeErrorRun(hookItem(makeTicket()), "missing_gemini_api_key");
    assert.equal(result.outcome, "ERROR");
    assert.equal(result.wouldHaveExecuted, false);
    assert.equal(result.executionIntent, null);
    assert.equal(result.status, "SKIP");
    assert.ok(result.errors[0]?.includes("missing_gemini"));
  });

  it("runCommitteeShadowBatch never throws when LLM returns error", async () => {
    const persisted: CommitteeRunResult[] = [];
    const runs = await runCommitteeShadowBatch([hookItem(makeTicket())], hookCtx, {
      createLlm: () => ({
        async generateObject() {
          return { ok: false, error: "missing_gemini_api_key" };
        },
      }),
      insertRun: async (r) => {
        persisted.push(r);
        return true;
      },
    });
    assert.equal(runs, 1);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]!.outcome, "ERROR");
    assert.equal(persisted[0]!.wouldHaveExecuted, false);
  });

  it("runCommitteeShadowBatch persists audit when insert succeeds on dry-run happy path", async () => {
    const persisted: CommitteeRunResult[] = [];
    const runs = await runCommitteeShadowBatch([hookItem(makeTicket(80))], hookCtx, {
      insertRun: async (r) => {
        persisted.push(r);
        return true;
      },
    });
    assert.equal(runs, 1);
    assert.equal(persisted[0]!.status, "COMPLETED");
    assert.ok(["WOULD_EXECUTE", "BLOCKED", "SKIPPED"].includes(persisted[0]!.outcome));
  });

  it("runCommitteeShadowBatch persists ERROR audits when LLM factory throws", async () => {
    const persisted: CommitteeRunResult[] = [];
    const runs = await runCommitteeShadowBatch([hookItem(makeTicket()), hookItem(makeTicket(70))], hookCtx, {
      createLlm: () => {
        throw new Error("llm_factory_crash");
      },
      insertRun: async (r) => {
        persisted.push(r);
        return true;
      },
    });
    assert.equal(runs, 2);
    assert.ok(persisted.every((r) => r.outcome === "ERROR"));
    assert.ok(persisted[0]!.errors[0]?.includes("llm_factory_crash"));
  });

  it("runCommitteeShadowBatch is no-op when COMMITTEE_ENABLED=false", async () => {
    process.env.COMMITTEE_ENABLED = "false";
    let called = false;
    const runs = await runCommitteeShadowBatch([hookItem(makeTicket())], hookCtx, {
      insertRun: async () => {
        called = true;
        return true;
      },
    });
    assert.equal(runs, 0);
    assert.equal(called, false);
  });
});
