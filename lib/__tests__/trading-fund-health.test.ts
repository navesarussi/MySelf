import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertsToSend, evaluateHealth, type HealthSnapshot } from "../trading/fund/health-core";

const NOW = Date.parse("2026-09-30T15:00:00Z");
const base: HealthSnapshot = {
  now: NOW,
  source: "main",
  last_tick_at: new Date(NOW - 5 * 60_000).toISOString(),
  last_intraday_tick_at: new Date(NOW - 2 * 60_000).toISOString(),
  intraday_enabled: true,
  positions: [{ symbol: "NVDA", dust: false }, { symbol: "BTC", dust: false }, { symbol: "DOGE", dust: true }],
  open_sell_orders: [{ symbol: "NVDA", type: "stop" }, { symbol: "BTC", type: "stop_limit" }],
  overdue_passes: [],
  last_tick_errors: [],
  kill_switch_active: false,
};
const level = (s: HealthSnapshot, id: string) => evaluateHealth(s).checks.find((c) => c.id === id)!.level;

describe("health checks", () => {
  it("is ok when everything is fresh and protected", () => {
    assert.equal(evaluateHealth(base).status, "ok");
  });
  it("flags a position without a stop (dust ignored; a queued market sell counts)", () => {
    const s = { ...base, open_sell_orders: [{ symbol: "NVDA", type: "market" }] };
    const r = evaluateHealth(s);
    const c = r.checks.find((x) => x.id === "protective_stop")!;
    assert.equal(c.level, "critical");
    assert.deepEqual(c.subjects, ["BTC"]);
    assert.equal(r.status, "critical");
  });
  it("a take-profit limit alone is not protection", () => {
    assert.equal(level({ ...base, open_sell_orders: [{ symbol: "NVDA", type: "stop" }, { symbol: "BTC", type: "limit" }] }, "protective_stop"), "critical");
  });
  it("each tick watches the other's heartbeat", () => {
    assert.equal(level({ ...base, source: "intraday", last_tick_at: new Date(NOW - 41 * 60_000).toISOString() }, "main_heartbeat"), "critical");
    assert.equal(level({ ...base, last_intraday_tick_at: new Date(NOW - 21 * 60_000).toISOString() }, "intraday_heartbeat"), "critical");
    assert.equal(level({ ...base, intraday_enabled: false, last_intraday_tick_at: null }, "intraday_heartbeat"), "ok");
  });
  it("overdue book passes, tick errors and the kill switch", () => {
    assert.equal(level({ ...base, overdue_passes: ["STOCKS 2026-09-29"] }, "book_pass"), "critical");
    assert.equal(level({ ...base, last_tick_errors: ["book: enter X: alpaca_403 insufficient"] }, "tick_errors"), "warn");
    assert.equal(level({ ...base, kill_switch_active: true }, "kill_switch"), "critical");
  });
});

describe("alerts", () => {
  it("raises each new critical subject once a day and reports recoveries", () => {
    const bad = evaluateHealth({ ...base, open_sell_orders: [{ symbol: "NVDA", type: "stop" }] });
    const a = alertsToSend(null, bad, new Map());
    assert.deepEqual(a.raise.map((x) => [x.id, x.subject]), [["protective_stop", "BTC"]]);
    const again = alertsToSend(bad, bad, new Map([["protective_stop", new Set(["BTC"])]]));
    assert.equal(again.raise.length, 0);
    const fixed = alertsToSend(bad, evaluateHealth(base), new Map());
    assert.deepEqual(fixed.resolved, ["protective_stop"]);
  });
});
