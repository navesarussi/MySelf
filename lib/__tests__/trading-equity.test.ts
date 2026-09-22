import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { equityFromTrades } from "../trading/account-equity";
import { round, roundMoney } from "../trading/round";
import type { TradeRow, TradingSettings } from "../trading/store";
import type { SimPosition } from "../trading/position";

const settings = { starting_equity: 100_000 } as TradingSettings;

function openTrade(input: {
  symbol: string;
  entry: number | null;
  size: number;
  cashFlow: number;
}): TradeRow {
  return {
    symbol: input.symbol,
    sim_state: {
      entry_price: input.entry,
      size: input.size,
      cash_flow: input.cashFlow,
    } as SimPosition,
  } as TradeRow;
}

/**
 * The tick and the dashboard both need account equity, and each used to carry
 * its own copy of the formula — so the number that sizes a position and the
 * number on screen could drift apart with nothing failing. One implementation
 * now; this pins its behaviour.
 */
describe("equityFromTrades", () => {
  it("is starting equity when nothing has happened", () => {
    assert.equal(equityFromTrades(settings, [], [], new Map()), 100_000);
  });

  it("adds realized P&L of closed trades", () => {
    const closed = [{ realized_pnl: 250.5 }, { realized_pnl: -100.25 }, { realized_pnl: null }];
    assert.equal(equityFromTrades(settings, [], closed, new Map()), 100_150.25);
  });

  it("marks open positions to the last price", () => {
    // Bought 10 @ 100 (cash out 1000), now worth 110.
    const open = [openTrade({ symbol: "BTC", entry: 100, size: 10, cashFlow: -1000 })];
    const prices = new Map([["BTC", 110]]);
    assert.equal(equityFromTrades(settings, open, [], prices), 100_100);
  });

  it("falls back to the entry price when no live price is available", () => {
    const open = [openTrade({ symbol: "BTC", entry: 100, size: 10, cashFlow: -1000 })];
    assert.equal(equityFromTrades(settings, open, [], new Map()), 100_000);
  });

  it("ignores positions that have not filled", () => {
    const open = [openTrade({ symbol: "BTC", entry: null, size: 10, cashFlow: 0 })];
    assert.equal(equityFromTrades(settings, open, [], new Map([["BTC", 110]])), 100_000);
  });

  it("counts a position that already took a partial exit once", () => {
    // Bought 10 @ 100, sold 5 @ 120 → cash_flow = -1000 + 600 = -400, 5 left.
    const open = [openTrade({ symbol: "ETH", entry: 100, size: 5, cashFlow: -400 })];
    assert.equal(equityFromTrades(settings, open, [], new Map([["ETH", 120]])), 100_200);
  });

  it("combines realized and unrealized, rounded to the cent", () => {
    const open = [openTrade({ symbol: "SOL", entry: 33.333, size: 3, cashFlow: -99.999 })];
    const closed = [{ realized_pnl: 10.005 }];
    const result = equityFromTrades(settings, open, closed, new Map([["SOL", 34.444]]));
    assert.equal(result, roundMoney(100_000 + 10.005 - 99.999 + 34.444 * 3));
    assert.equal(Math.round(result * 100), result * 100, "must be a whole number of agorot");
  });
});

describe("round", () => {
  it("rounds to the requested precision", () => {
    assert.equal(round(1.23456), 1.2346);
    assert.equal(round(1.23456, 2), 1.23);
    assert.equal(roundMoney(1.005), 1.0); // binary float, documented behaviour
    assert.equal(roundMoney(2.675), 2.68);
  });

  it("passes non-finite values through instead of producing NaN arithmetic", () => {
    assert.equal(round(Infinity), Infinity);
    assert.ok(Number.isNaN(round(NaN)));
  });
});
