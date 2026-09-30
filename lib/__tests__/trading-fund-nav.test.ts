import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attributeDay, buildMarks, chainNav, currentSessionDay, historyPoints, liveSessionPoint, sessionDay } from "../trading/fund/nav-core";


describe("NAV from portfolio history", () => {
  // Real Alpaca demo rows (2026-09): placeholder equity before funding, the deposit on the 14th, fees in CFEE.
  const ts = (iso: string) => Date.parse(iso) / 1000;
  const h = {
    timestamp: [ts("2026-09-11T00:00:00Z"), ts("2026-09-12T00:00:00Z"), ts("2026-09-15T00:00:00Z"), ts("2026-09-16T00:00:00Z"), ts("2026-11-04T01:00:00Z")],
    equity: [100000, 100000, 97672.82, 90785.45, 91785.45],
    profit_loss: [0, 0, -2327.18, -6887.37, 1000],
    cashflow: { JNLC: [0, 0, 100000, 0, 0], CFEE: [0, 0, 0, -39.38, 0] },
  };
  it("labels each point with its session date", () => {
    assert.equal(sessionDay(ts("2026-09-15T00:00:00Z")), "2026-09-14");
    assert.equal(sessionDay(ts("2026-11-04T01:00:00Z")), "2026-11-03");
    assert.equal(sessionDay(ts("2025-11-28T22:00:00Z")), "2025-11-28");
  });
  it("takes P&L net of deposits from Alpaca and chains returns on starting capital", () => {
    const pts = historyPoints(h);
    assert.deepEqual(pts.map((p) => [p.day, p.cash_flow]), [["2026-09-10", 0], ["2026-09-11", 0], ["2026-09-14", 100000], ["2026-09-15", 0], ["2026-11-03", 0]]);
    const rows = chainNav(pts, "2026-09-15");
    assert.equal(rows[1].nav_index, 100);
    assert.ok(Math.abs(rows[2].twr_return - -2327.18 / 100000) < 1e-12);
    assert.equal(rows[2].pre_book, true);
    assert.equal(rows[3].pre_book, false);
    assert.ok(Math.abs(rows[3].twr_return - -6887.37 / 97672.82) < 1e-12);
    assert.ok(Math.abs(rows[4].nav_index - 100 * (1 - 2327.18 / 100000) * (1 - 6887.37 / 97672.82) * (1 + 1000 / 90785.45)) < 1e-9);
  });
  it("tracks the peak and drawdown of the index", () => {
    const rows = chainNav(
      [{ day: "a", equity: 100, pnl: 0, cash_flow: 0 }, { day: "b", equity: 110, pnl: 10, cash_flow: 0 }, { day: "c", equity: 99, pnl: -11, cash_flow: 0 }],
      "a"
    );
    assert.ok(Math.abs(rows[1].peak_index - 110) < 1e-9);
    assert.ok(Math.abs(rows[2].drawdown - 0.1) < 1e-12);
  });
  it("adds the session in progress from the live account", () => {
    assert.deepEqual(liveSessionPoint({ day: "2026-09-30", equity: 114655.95, last_equity: 114765.36 }), { day: "2026-09-30", equity: 114655.95, pnl: 114655.95 - 114765.36, cash_flow: 0 });
    assert.equal(liveSessionPoint({ day: "x", equity: 0, last_equity: 1 }), null);
  });
  it("rolls weekends into Monday's session, New York time", () => {
    assert.equal(currentSessionDay(Date.parse("2026-09-30T13:47:00Z")), "2026-09-30");
    assert.equal(currentSessionDay(Date.parse("2026-10-01T02:00:00Z")), "2026-09-30");
    assert.equal(currentSessionDay(Date.parse("2026-10-03T15:00:00Z")), "2026-10-05");
    assert.equal(currentSessionDay(Date.parse("2026-12-01T04:30:00Z")), "2026-11-30");
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
