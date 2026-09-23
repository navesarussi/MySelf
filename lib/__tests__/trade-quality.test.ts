import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureEfficiency,
  holdingHours,
  riskUsd,
  tradeCosts,
  tradeQuality,
  qualityReport,
  type QualityInput,
} from "../trading/trade-quality";

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** A 10-unit long filled at 100 with the stop at 98 → 1R = $2/unit = $20. */
const base: QualityInput = {
  entry_price: 100,
  initial_stop_price: 98,
  target_price: 104,
  exit_price: 103,
  position_size: 10,
  realized_r: 1.5,
  realized_pnl: 30,
  fees_paid: 2,
  entry_slippage_bps: 5,
  mfe_r: 2,
  mae_r: -0.4,
  opened_at: "2026-09-20T10:00:00.000Z",
  closed_at: "2026-09-20T16:30:00.000Z",
};

describe("riskUsd", () => {
  it("derives 1R from the realized figures, which are authoritative", () => {
    // 30 / 1.5 = 20, and that already accounts for a partial broker fill.
    assert.equal(riskUsd(base), 20);
  });

  it("falls back to size × stop distance when the trade has no realized R", () => {
    assert.equal(riskUsd({ ...base, realized_r: 0, realized_pnl: 0 }), 20);
    assert.equal(riskUsd({ ...base, realized_r: null, realized_pnl: null }), 20);
  });

  it("returns null when neither route has the numbers", () => {
    assert.equal(riskUsd({ ...base, realized_r: null, realized_pnl: null, entry_price: null }), null);
    assert.equal(
      riskUsd({ ...base, realized_r: null, realized_pnl: null, initial_stop_price: 100 }),
      null,
      "a stop at the entry is not a risk of zero, it is unusable"
    );
  });
});

describe("tradeCosts", () => {
  it("expresses fees and slippage in R, which is what the edge is measured in", () => {
    const c = tradeCosts(base)!;
    assert.equal(c.fee_r, 0.1); // $2 of fees on a $20 risk
    // 5bps of 100 = $0.05/unit × 10 units = $0.50 → 0.025R
    assert.equal(c.slippage_r, 0.025);
    assert.equal(c.total_cost_r, 0.125);
  });

  it("reports the gross R the strategy would have earned without costs", () => {
    const c = tradeCosts(base)!;
    // realized_r is already net of fees; slippage is inside the entry price.
    assert.equal(c.net_r, 1.5);
    assert.equal(c.gross_r, 1.625);
  });

  it("handles a trade with no slippage figure", () => {
    const c = tradeCosts({ ...base, entry_slippage_bps: null })!;
    assert.equal(c.slippage_r, null);
    assert.equal(c.total_cost_r, 0.1);
  });

  it("returns null when risk cannot be established", () => {
    assert.equal(tradeCosts({ ...base, realized_r: null, realized_pnl: null, entry_price: null }), null);
  });
});

describe("captureEfficiency", () => {
  it("is the share of the favourable move the exit actually kept", () => {
    // MFE 2R, exit at 1.5R → kept three quarters of what was offered.
    assert.equal(captureEfficiency(base), 0.75);
  });

  it("is 1 when the exit is the high of the trade", () => {
    assert.equal(captureEfficiency({ ...base, realized_r: 2, realized_pnl: 40 }), 1);
  });

  it("is null when the trade never went favourable — there was nothing to capture", () => {
    assert.equal(captureEfficiency({ ...base, mfe_r: 0 }), null);
    assert.equal(captureEfficiency({ ...base, mfe_r: -0.2 }), null);
  });

  it("is null while the trade is still open", () => {
    assert.equal(captureEfficiency({ ...base, realized_r: null, exit_price: null }), null);
  });

  it("can be negative when a trade that was up closed at a loss", () => {
    assert.equal(captureEfficiency({ ...base, realized_r: -1, realized_pnl: -20 }), -0.5);
  });
});

describe("holdingHours", () => {
  it("measures fill to exit", () => {
    assert.equal(holdingHours(base), 6.5);
  });

  it("is null without both ends", () => {
    assert.equal(holdingHours({ ...base, opened_at: null }), null);
    assert.equal(holdingHours({ ...base, closed_at: null }), null);
    assert.equal(holdingHours({ ...base, opened_at: "not-a-date" }), null);
  });

  it("is null when the clock ran backwards", () => {
    assert.equal(holdingHours({ ...base, closed_at: "2026-09-20T09:00:00.000Z" }), null);
  });
});

describe("tradeQuality", () => {
  it("gathers everything a closed trade should show", () => {
    const q = tradeQuality(base);
    assert.equal(q.risk_usd, 20);
    assert.equal(q.net_r, 1.5);
    assert.equal(q.gross_r, 1.625);
    assert.equal(q.capture_efficiency, 0.75);
    assert.equal(q.hold_hours, 6.5);
    assert.equal(q.notional, 1000);
    assert.equal(q.r_to_target, 2); // (104 - 100) / 2
  });

  it("degrades gracefully for an open trade", () => {
    const q = tradeQuality({ ...base, realized_r: null, realized_pnl: null, exit_price: null, closed_at: null });
    assert.equal(q.net_r, null);
    assert.equal(q.capture_efficiency, null);
    assert.equal(q.hold_hours, null);
    assert.equal(q.risk_usd, 20, "risk is known from the plan even before the exit");
  });
});

describe("qualityReport", () => {
  const win = { ...base };
  const loss: QualityInput = {
    ...base,
    exit_price: 98,
    realized_r: -1,
    realized_pnl: -20,
    mfe_r: 0.3,
    mae_r: -1,
    closed_at: "2026-09-20T11:00:00.000Z",
  };
  const bigWin: QualityInput = {
    ...base,
    exit_price: 106,
    realized_r: 3,
    realized_pnl: 60,
    mfe_r: 3.2,
    mae_r: -0.1,
    closed_at: "2026-09-21T10:00:00.000Z",
  };

  it("separates how long winners and losers are held", () => {
    const r = qualityReport([win, loss, bigWin]);
    assert.equal(r.hold_hours_winners, 15.25); // (6.5 + 24) / 2
    assert.equal(r.hold_hours_losers, 1);
  });

  /**
   * The classic stop-placement question: how much heat did the trades that
   * eventually worked have to take? A stop tighter than this figure would have
   * cut winners out of the book.
   */
  it("reports the worst heat a winner survived", () => {
    const r = qualityReport([win, loss, bigWin]);
    assert.equal(r.worst_mae_of_winners, -0.4);
    assert.equal(r.avg_mae_of_winners, -0.25);
  });

  it("totals what costs took out of the edge", () => {
    const r = qualityReport([win, loss, bigWin]);
    assert.equal(r.total_fees_r, 0.3); // 0.1R each
    assert.equal(r.expectancy_r, round3((1.5 - 1 + 3) / 3));
    assert.equal(r.gross_expectancy_r, round3((1.625 - 0.875 + 3.125) / 3));
  });

  it("reports P&L in money as well as in R", () => {
    const r = qualityReport([win, loss, bigWin]);
    assert.equal(r.total_pnl, 70);
    assert.equal(r.total_fees, 6);
  });

  it("handles an empty book without dividing by zero", () => {
    const r = qualityReport([]);
    assert.equal(r.trades, 0);
    assert.equal(r.expectancy_r, 0);
    assert.equal(r.worst_mae_of_winners, null);
    assert.equal(r.avg_capture_efficiency, null);
  });
});
