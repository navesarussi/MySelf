import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyExternalFill, newPendingPosition, openRiskR, realizedR, forceClose } from "../trading/position";
import { monteCarlo } from "../trading/metrics";
import { RISK_ENVELOPE } from "../trading/config";
import { brokerSupportsExitPlan } from "../trading/broker/sync";

describe("applyExternalFill", () => {
  const pending = () =>
    newPendingPosition({ asset_class: "CRYPTO_ALT", entry: 100, stop: 98, size: 10 });

  it("adopts the broker price, quantity and stop distance on a normal fill", () => {
    const p = pending();
    applyExternalFill(p, 100.5, 9.8, 1_000);
    assert.equal(p.state, "OPEN");
    assert.equal(p.entry_price, 100.5);
    assert.equal(p.initial_size, 9.8);
    assert.equal(p.size, 9.8);
    assert.ok(Math.abs(p.stop_distance - 2.5) < 1e-9);
    assert.equal(p.opened_at, 1_000);
  });

  /**
   * A fill at or below the protective stop (a gap, or a stop the broker moved
   * past while the order sat) made stop_distance zero or negative. Every R
   * figure downstream divides by initial_size * stop_distance, so the trade
   * reported ±Infinity R, and openRiskR read the position as risk-free because
   * stop_price >= entry_price.
   */
  it("keeps a positive stop distance when the broker fills at or below the stop", () => {
    const p = pending();
    applyExternalFill(p, 97, 10, 1_000);
    assert.ok(p.stop_distance > 0, `stop_distance ${p.stop_distance} must stay positive`);
    assert.ok(p.stop_price < p.entry_price!, "stop must sit below a long entry");
    assert.equal(openRiskR(p), 1, "a filled position below its stop still carries risk");
    const r = realizedR({ ...p, cash_flow: -50 });
    assert.ok(Number.isFinite(r), `realizedR must stay finite, got ${r}`);
  });

  it("produces a finite R when such a position is closed", () => {
    const p = pending();
    applyExternalFill(p, 97, 10, 1_000);
    forceClose(p, 95, "STOP", 2_000);
    assert.ok(Number.isFinite(realizedR(p)), "realized R must be finite");
    assert.ok(realizedR(p) < 0, "a close below entry is a loss");
  });

  it("rejects a non-positive fill price instead of corrupting the position", () => {
    const p = pending();
    const events = applyExternalFill(p, 0, 10, 1_000);
    assert.equal(events.length, 0);
    assert.equal(p.state, "PENDING");
    assert.equal(p.entry_price, null);
  });

  it("rejects a non-positive quantity instead of opening an empty position", () => {
    const p = pending();
    const events = applyExternalFill(p, 100, 0, 1_000);
    assert.equal(events.length, 0);
    assert.equal(p.state, "PENDING");
  });
});

describe("monteCarlo kill-switch probability", () => {
  /**
   * The simulation used a hard-coded 15% drawdown while the envelope's
   * MASTER_KILL_SWITCH_DD is the number the live system actually trips on.
   * backtestGate gates on mc_prob_kill <= 0.1, so a drifted constant gates the
   * strategy on a threshold the system does not use.
   */
  it("trips exactly at the risk envelope's kill-switch drawdown, whatever it is set to", () => {
    const risk = 0.005;
    // Longest run of −1R losses whose compounded drawdown stays below the envelope's threshold.
    const n = Math.floor(Math.log(1 - RISK_ENVELOPE.MASTER_KILL_SWITCH_DD) / Math.log(1 - risk));
    assert.ok(1 - Math.pow(1 - risk, n - 1) < RISK_ENVELOPE.MASTER_KILL_SWITCH_DD, "fixture sits below the threshold");
    const below = monteCarlo(Array.from({ length: n - 1 }, () => -1), risk, 200, 7);
    assert.equal(below.prob_kill_switch, 0, "must not trip before the envelope's drawdown");
    const above = monteCarlo(Array.from({ length: n + 2 }, () => -1), risk, 200, 7);
    assert.equal(above.prob_kill_switch, 1, "must trip once the envelope's drawdown is breached");
  });

  it("does report kills once the envelope drawdown is breached", () => {
    const rs = Array.from({ length: 200 }, () => -1);
    const res = monteCarlo(rs, 0.005, 200, 7);
    assert.ok(res.prob_kill_switch > 0.9, `expected near-certain kill, got ${res.prob_kill_switch}`);
  });
});

describe("brokerSupportsExitPlan", () => {
  it("accepts the structural plans every live strategy uses", () => {
    assert.equal(brokerSupportsExitPlan({ exit_plan: "STRUCTURAL", partial_fraction: 0 }), true);
    assert.equal(brokerSupportsExitPlan({ exit_plan: "STRUCTURAL" }), true);
  });

  it("refuses a plan that would take an unmirrored partial exit", () => {
    assert.equal(brokerSupportsExitPlan({ exit_plan: "STRUCTURAL", partial_fraction: 0.5 }), false);
    // v1 plans sell half at 1R through use_partial, which partial_fraction does not describe.
    assert.equal(brokerSupportsExitPlan({ exit_plan: "TARGET_2R", use_partial: true }), false);
    assert.equal(brokerSupportsExitPlan({ exit_plan: null, use_partial: true }), false);
    assert.equal(brokerSupportsExitPlan({ exit_plan: "TARGET_2R", use_partial: false }), true);
  });

  it("holds for a position built by newPendingPosition for the live plans", () => {
    const p = newPendingPosition({ asset_class: "CRYPTO_ALT", entry: 100, stop: 98, size: 1 });
    p.exit_plan = "STRUCTURAL";
    p.partial_fraction = 0;
    assert.equal(brokerSupportsExitPlan(p), true);
    p.partial_fraction = 0.5;
    assert.equal(brokerSupportsExitPlan(p), false);
  });
});
