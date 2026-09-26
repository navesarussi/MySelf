import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateSmokeResponse, formatSmokeAlert, smokeEndpoints } from "../ops/smoke";

describe("evaluateSmokeResponse", () => {
  it("passes a 200 JSON body without degraded", () => {
    assert.equal(evaluateSmokeResponse(200, JSON.stringify({ kpis: [] })), null);
    assert.equal(evaluateSmokeResponse(200, JSON.stringify([{ id: 1 }])), null);
    assert.equal(evaluateSmokeResponse(200, JSON.stringify({ degraded: [] })), null);
  });

  it("fails a non-empty degraded array", () => {
    const body = JSON.stringify({ degraded: ["financeNet", "trading"] });
    assert.equal(evaluateSmokeResponse(200, body), "degraded: financeNet, trading");
  });

  it("fails non-200 and non-JSON responses", () => {
    assert.equal(evaluateSmokeResponse(500, "{}"), "http_500");
    assert.equal(evaluateSmokeResponse(401, ""), "http_401");
    assert.equal(evaluateSmokeResponse(200, "<html>"), "invalid_json");
  });
});

describe("smokeEndpoints", () => {
  it("covers the key read endpoints with the current month for the plan", () => {
    const paths = smokeEndpoints(new Date("2026-09-25T12:00:00Z"));
    assert.deepEqual(paths, [
      "/api/v1/home",
      "/api/v1/tasks",
      "/api/v1/habits",
      "/api/v1/goals",
      "/api/v1/finance/plan?month=2026-09",
      "/api/v1/relationships",
      "/api/v1/trading/equity",
    ]);
  });
});

describe("evaluateSmokeResponse contract checks", () => {
  it("fails home when legacy trading fields are missing", () => {
    const body = JSON.stringify({
      habits: [],
      habitsPending: 0,
      habitsOverdue: 0,
      activeGoals: [],
      doneGoalsCount: 0,
      pendingCommitments: [],
      relationships: [],
      recentEvents: [],
      eventsMode: "recent",
      openTasks: [],
      projects: [],
      libraryEntries: [],
      openTasksCount: 0,
      inProgressTasksCount: 0,
      doneTasksCount: 0,
      avgTaskCloseDays: null,
      financeUncategorizedCount: 0,
      urgentFinance: null,
      finance: { month: "2026-09", net_actual: 0, uncategorized_count: 0 },
      trading: { equity: 1, starting_equity: 1, kill_switch_active: false },
    });
    const failure = evaluateSmokeResponse(200, body, "/api/v1/home") ?? "";
    assert.ok(failure.startsWith("contract:"));
    assert.match(failure, /missing_trading_field:phase|trading\.phase/);
  });
});

describe("formatSmokeAlert", () => {
  it("lists each failure and the commit", () => {
    const alert = formatSmokeAlert(
      [
        { path: "/api/v1/home", status: 200, failure: "degraded: financeNet", ms: 120 },
        { path: "/api/v1/finance/plan?month=2026-09", status: 500, failure: "http_500", ms: 90 },
      ],
      "702863de79480795"
    );
    assert.equal(alert.body, "• /api/v1/home: degraded: financeNet\n• /api/v1/finance/plan: http_500\ncommit 702863d");
  });
});
