import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFundView, type NavDb } from "../trading/service-fund";

const nav: NavDb[] = [
  { day: "2026-09-26", equity: 100_000, pnl: 0, twr_return: 0, nav_index: 110, peak_index: 120, drawdown: 0.083, by_strategy: null, unattributed: null },
  { day: "2026-09-29", equity: 101_000, pnl: 1_000, twr_return: 0.01, nav_index: 111.1, peak_index: 120, drawdown: 0.074, by_strategy: { REVERSAL: 800, CRYPTO_TREND: 150 }, unattributed: 50 },
  { day: "2026-10-01", equity: 100_495, pnl: -505, twr_return: -0.005, nav_index: 110.5445, peak_index: 120, drawdown: 0.079, by_strategy: { REVERSAL: -505 }, unattributed: 0 },
];

describe("fund view", () => {
  it("rebases NAV to inception, splits MTD from ITD and ranks attribution", () => {
    const v = buildFundView({ nav, model: [], signals: [], fills: new Map(), health: null, inception: "2026-09-28" });
    assert.deepEqual(v.nav.map((x) => x.day), ["2026-09-29", "2026-10-01"]);
    assert.ok(Math.abs(v.nav[0].index - 101) < 1e-9);
    assert.ok(Math.abs((v.itd_return ?? 0) - (1.01 * 0.995 - 1)) < 1e-9);
    assert.ok(Math.abs((v.mtd_return ?? 0) - -0.005) < 1e-9);
    assert.equal(v.attribution[0].strategy, "REVERSAL");
    assert.equal(v.attribution[0].itd_usd, 295);
    assert.equal(v.attribution[0].mtd_usd, -505);
    assert.equal(v.unattributed_itd, 50);
    assert.equal(v.equity, 100_495);
  });
});
