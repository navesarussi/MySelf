import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { missedSignals, shortfall, trackingSeries, trackingStats, type NavLite } from "../trading/fund/tracking";

describe("live vs model", () => {
  const nav: NavLite[] = [
    { day: "2026-09-25", equity: 100_000, by_strategy: null },
    { day: "2026-09-28", equity: 101_000, by_strategy: { CRYPTO_TREND: 600, REVERSAL: 300, MANUAL: 100 } },
    { day: "2026-09-29", equity: 100_500, by_strategy: { CRYPTO_TREND: -500, MOMENTUM: 0 } },
  ];
  const model = [
    { day: "2026-09-26", grp: "CRYPTO", day_return: 0.002 },
    { day: "2026-09-27", grp: "CRYPTO", day_return: 0.002 },
    { day: "2026-09-28", grp: "CRYPTO", day_return: 0.002 },
    { day: "2026-09-29", grp: "CRYPTO", day_return: -0.004 },
  ];
  it("compounds model days between NAV sessions (weekend crypto) and divides live group P&L by the previous equity", () => {
    const s = trackingSeries(nav, model, "CRYPTO");
    assert.equal(s.length, 2);
    assert.equal(s[0].day, "2026-09-28");
    assert.ok(Math.abs(s[0].live - 0.006) < 1e-12);
    assert.ok(Math.abs(s[0].model - (1.002 ** 3 - 1)) < 1e-12);
    assert.ok(Math.abs(s[1].live - -500 / 101_000) < 1e-12);
  });
  it("summarises cumulative difference and tracking error", () => {
    const st = trackingStats([{ day: "a", live: 0.01, model: 0.0, diff: 0.01 }, { day: "b", live: 0, model: 0.01, diff: -0.01 }]);
    assert.equal(st.days, 2);
    assert.ok(Math.abs(st.live_cum - 0.01) < 1e-12);
    assert.ok(st.te_annual !== null && Math.abs(st.te_annual - 0.01 * Math.sqrt(252)) < 1e-9);
  });
});

describe("execution quality", () => {
  const signals = [
    { strategy: "REVERSAL", entry: 100, decision: "ENTERED", trade_id: "a" },
    { strategy: "REVERSAL", entry: 50, decision: "ENTERED", trade_id: "b" },
    { strategy: "REVERSAL", entry: 20, decision: "ENTERED", trade_id: "unfilled" },
    { strategy: "MOMENTUM", entry: 10, decision: "MAX_GROSS", trade_id: null },
    { strategy: "REVERSAL", entry: 10, decision: "MAX_GROSS", trade_id: null },
    { strategy: "REVERSAL", entry: 10, decision: "ALREADY_IN_SYMBOL", trade_id: null },
  ];
  it("measures fill vs signal price per strategy", () => {
    const fills = new Map([
      ["a", { entry_price: 100.1, qty: 10, asset_class: "STOCK" }],
      ["b", { entry_price: 49.9, qty: 20, asset_class: "STOCK" }],
      ["unfilled", { entry_price: null, qty: null, asset_class: "STOCK" }],
    ]);
    const [r] = shortfall(signals, fills);
    assert.equal(r.strategy, "REVERSAL");
    assert.equal(r.n, 2);
    assert.ok(Math.abs(r.mean_bps - (10 + -20) / 2) < 1e-9);
    assert.ok(Math.abs(r.usd - (0.1 * 10 + -0.1 * 20)) < 1e-9);
  });
  it("counts blocked signals by reason", () => {
    assert.deepEqual(missedSignals(signals), [{ reason: "MAX_GROSS", n: 2 }, { reason: "ALREADY_IN_SYMBOL", n: 1 }]);
  });
});
