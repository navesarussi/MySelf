import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attributeDay, buildMarks, chainNav, historyPoints } from "../trading/fund/nav-core";

const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;

describe("NAV from portfolio history", () => {
  it("splits deposits from P&L; fees stay in P&L", () => {
    const pts = historyPoints({
      timestamp: [day("2026-09-11"), day("2026-09-14"), day("2026-09-15"), day("2026-09-16")],
      equity: [0, 100000, 101000, 151500],
      cashflow: { JNLC: [0, 100000, 0, 50000], CFEE: [0, 0, -40, 0] },
    });
    assert.deepEqual(pts.map((p) => [p.day, p.cash_flow]), [["2026-09-14", 100000], ["2026-09-15", 0], ["2026-09-16", 50000]]);
    const rows = chainNav(pts, "2026-09-15");
    assert.equal(rows[0].nav_index, 100);
    assert.equal(rows[0].pre_book, true);
    assert.equal(rows[1].pnl, 1000);
    assert.equal(rows[1].twr_return, 0.01);
    assert.equal(rows[1].pre_book, false);
    // +500 on 101000 + 50000 deposited that day
    assert.equal(rows[2].pnl, 500);
    assert.ok(Math.abs(rows[2].twr_return - 500 / 151000) < 1e-12);
    assert.ok(Math.abs(rows[2].nav_index - 100 * 1.01 * (1 + 500 / 151000)) < 1e-9);
  });
  it("tracks the peak and drawdown of the index", () => {
    const rows = chainNav(
      [{ day: "a", equity: 100, cash_flow: 0 }, { day: "b", equity: 110, cash_flow: 0 }, { day: "c", equity: 99, cash_flow: 0 }],
      "a"
    );
    assert.ok(Math.abs(rows[1].peak_index - 110) < 1e-9);
    assert.ok(Math.abs(rows[2].drawdown - 0.1) < 1e-12);
  });
});

describe("marks and attribution", () => {
  const open = [
    { id: "t1", symbol: "BTC", setup: "CRYPTO_TREND", strategy_version: "book" },
    { id: "t2", symbol: "NVDA", setup: "REVERSAL", strategy_version: "book" },
  ];
  it("marks open trades from broker unrealized P&L, untracked positions by symbol, closed trades by realized", () => {
    const marks = buildMarks({
      positions: [{ symbol: "BTC", unrealized_pl: 120, dust: false }, { symbol: "XYZ", unrealized_pl: -5, dust: false }, { symbol: "DOGE", unrealized_pl: 0, dust: true }],
      open,
      closed: [{ id: "t3", setup: "MOMENTUM", strategy_version: "book", realized_pnl: 300 }, { id: "t4", setup: null, strategy_version: "manual", realized_pnl: null }],
      prev: { t4: { strategy: "MANUAL", mark: -10 } },
    });
    assert.deepEqual(marks, {
      t1: { strategy: "CRYPTO_TREND", mark: 120 },
      "pos:XYZ": { strategy: "UNTRACKED", mark: -5 },
      t3: { strategy: "MOMENTUM", mark: 300 },
      t4: { strategy: "MANUAL", mark: -10 },
    });
  });
  it("attributes the day's P&L by mark change and keeps an exact residual", () => {
    const prev = { t1: { strategy: "CRYPTO_TREND", mark: 100 }, t3: { strategy: "MOMENTUM", mark: 250 }, gone: { strategy: "REVERSAL", mark: 80 } };
    const now = { t1: { strategy: "CRYPTO_TREND", mark: 120 }, t3: { strategy: "MOMENTUM", mark: 300 }, t5: { strategy: "REVERSAL", mark: -30 } };
    const a = attributeDay(prev, now, 45);
    assert.deepEqual(a, { by_strategy: { CRYPTO_TREND: 20, MOMENTUM: 50, REVERSAL: -30 }, unattributed: 5 });
  });
  it("cannot attribute without the previous day's marks", () => {
    assert.equal(attributeDay(null, {}, 10), null);
  });
});
