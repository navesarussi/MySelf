import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { R_MEASUREMENT } from "../trading/config";
import { isMeasurableTrade, measurableR, partitionMeasurableTrades } from "../trading/measurable-trades";
import { flooredRiskUsd, flooredStopDistance, storedRiskUsd } from "../trading/r-measurement";

const base = {
  track: "AGENT" as const,
  execution: "PAPER" as const,
  broker: "ALPACA_PAPER",
  reconciliation_kind: null,
  broker_settled_at: "2026-09-20T12:00:00.000Z",
  exit_price_confirmed: true,
  entry_price: 100,
  broker_filled_qty: 10,
  state: "CLOSED" as const,
  realized_r: 50,
  realized_pnl: 500,
  initial_stop_price: 99.99,
  position_size: 10,
  sim_state: { opened_at: 1, state: "CLOSED" as const, entry_price: 100, initial_size: 10 },
};

describe("isMeasurableTrade", () => {
  it("includes broker-settled account trades with no reconciliation kind", () => {
    assert.equal(isMeasurableTrade(base, "PAPER"), true);
  });

  it("excludes every reconciliation_kind value", () => {
    assert.equal(isMeasurableTrade({ ...base, reconciliation_kind: "orphan_close" }, "PAPER"), false);
    assert.equal(isMeasurableTrade({ ...base, reconciliation_kind: "journal_flat" }, "PAPER"), false);
    assert.equal(isMeasurableTrade({ ...base, reconciliation_kind: "journal_flat_unknown" }, "PAPER"), false);
  });

  it("excludes unsettled broker trades and estimated manual exits", () => {
    assert.equal(isMeasurableTrade({ ...base, broker_settled_at: null }, "PAPER"), false);
    assert.equal(isMeasurableTrade({ ...base, exit_price_confirmed: false }, "PAPER"), false);
  });

  it("excludes trades without broker in PAPER phase", () => {
    assert.equal(isMeasurableTrade({ ...base, broker: null }, "PAPER"), false);
  });
});

describe("R measurement floor", () => {
  it("floors tiny stop distance to MIN_STOP_DISTANCE_PCT of entry", () => {
    const entry = 200;
    const tightStop = entry - 0.01;
    const floored = flooredStopDistance({ entry_price: entry, stop_price: tightStop });
    assert.equal(floored, entry * R_MEASUREMENT.MIN_STOP_DISTANCE_PCT);
    const risk = flooredRiskUsd({ entry_price: entry, stop_price: tightStop, size: 5 });
    assert.equal(risk, floored * 5);
  });

  it("caps inflated R when recomputing from P&L", () => {
    const t = {
      ...base,
      entry_price: 100,
      initial_stop_price: 99.99,
      position_size: 10,
      realized_pnl: 100,
      realized_r: 1000,
    };
    const r = measurableR(t);
    const stored = storedRiskUsd(100, 1000);
    const floored = flooredRiskUsd({ entry_price: 100, stop_price: 99.99, size: 10 });
    const risk = Math.max(stored, floored);
    assert.ok(r < 1000);
    assert.equal(r, Math.round((100 / risk) * 1000) / 1000);
  });

  it("never increases |R| vs stored realized_r when floor does not apply", () => {
    const cases = [
      { entry: 20, stop: 18, size: 500, pnl: -240, stored: -0.024 },
      { entry: 0.55, stop: 0.5, size: 8000, pnl: -144, stored: -0.018 },
      { entry: 11, stop: 10, size: 4000, pnl: 41468, stored: 10.367 },
    ];
    for (const c of cases) {
      const t = { ...base, entry_price: c.entry, initial_stop_price: c.stop, position_size: c.size, realized_pnl: c.pnl, realized_r: c.stored };
      const r = measurableR(t);
      assert.ok(Math.abs(r) <= Math.abs(c.stored) + 1e-9, `${c.stored} -> ${r}`);
    }
  });

  it("shrinks |R| when the measurement floor applies", () => {
    const t = { ...base, entry_price: 100, initial_stop_price: 99.99, position_size: 10, realized_pnl: -5, realized_r: -50 };
    assert.ok(Math.abs(measurableR(t)) < 50);
  });

  it("uses ATR floor when provided", () => {
    const dist = flooredStopDistance({ entry_price: 50, stop_price: 49.9, atr: 4 });
    assert.equal(dist, Math.max(0.1, 50 * R_MEASUREMENT.MIN_STOP_DISTANCE_PCT, 4 * R_MEASUREMENT.MIN_STOP_ATR_FRACTION));
  });
});

describe("partitionMeasurableTrades", () => {
  it("splits measurable vs excluded closed rows", () => {
    const rows = [base, { ...base, reconciliation_kind: "orphan_close" }, { ...base, broker_settled_at: null }];
    const { measurable, excluded } = partitionMeasurableTrades(rows, "PAPER");
    assert.equal(measurable.length, 1);
    assert.equal(excluded.length, 2);
  });
});
