import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALPACA_PAPER_BASE, alpacaPositionSymbol, alpacaSymbol, roundPrice, roundQty } from "../trading/broker/alpaca";
import { bracketLegs, brokerExit, pendingDecision, protectiveAdjustments } from "../trading/broker/sync";
import { agentValueReport, type JournalTrade } from "../trading/learning";
import { isBaselineCandidate } from "../trading/strategy/candidates";
import type { AlpacaOrder } from "../trading/broker/alpaca";

const order = (o: Partial<AlpacaOrder>): AlpacaOrder => ({
  id: "o1",
  client_order_id: "c1",
  symbol: "SOL/USD",
  status: "new",
  side: "buy",
  type: "limit",
  qty: "10",
  filled_qty: "0",
  filled_avg_price: null,
  limit_price: "100",
  stop_price: null,
  order_class: "simple",
  legs: null,
  filled_at: null,
  created_at: "2026-09-14T00:00:00Z",
  ...o,
});

describe("alpaca adapter (paper only)", () => {
  it("is hard-wired to the paper endpoint", () => {
    assert.equal(ALPACA_PAPER_BASE, "https://paper-api.alpaca.markets");
  });

  it("maps symbols and rounds to accepted increments", () => {
    assert.equal(alpacaSymbol("BTC", "CRYPTO_MAJOR"), "BTC/USD");
    assert.equal(alpacaPositionSymbol("BTC", "CRYPTO_MAJOR"), "BTCUSD");
    assert.equal(alpacaSymbol("NVDA", "STOCK"), "NVDA");
    assert.equal(roundPrice(123.456, "STOCK"), 123.46);
    assert.equal(roundQty(12.9, "STOCK"), 12);
    assert.equal(roundQty(0.12345678, "CRYPTO_ALT"), 0.123456);
  });
});

describe("broker sync decisions", () => {
  const trig = Date.parse("2026-09-14T00:00:00Z");

  it("waits, fills, expires", () => {
    assert.equal(pendingDecision(order({}), trig, trig + 3_600_000).kind, "WAIT");
    const filled = pendingDecision(order({ status: "filled", filled_qty: "10", filled_avg_price: "99.5", filled_at: "2026-09-14T01:10:00Z" }), trig, trig + 7_200_000);
    assert.deepEqual(filled, { kind: "FILLED", price: 99.5, qty: 10, at: Date.parse("2026-09-14T01:10:00Z") });
    assert.equal(pendingDecision(order({}), trig, trig + 5 * 3_600_000).kind, "EXPIRE");
    assert.equal(pendingDecision(order({ status: "rejected" }), trig, trig).kind, "DEAD");
  });

  it("keeps a ≥70% partial fill and unwinds a smaller one", () => {
    assert.equal(pendingDecision(order({ status: "partially_filled", filled_qty: "8", filled_avg_price: "100" }), trig, trig + 5 * 3_600_000).kind, "PARTIAL_KEEP");
    assert.equal(pendingDecision(order({ status: "canceled", filled_qty: "3", filled_avg_price: "100" }), trig, trig).kind, "PARTIAL_UNWIND");
  });

  it("reads bracket legs and broker-side exits", () => {
    const entry = order({ order_class: "bracket", legs: [order({ id: "tp", type: "limit", side: "sell", limit_price: "120" }), order({ id: "sl", type: "stop", side: "sell", stop_price: "95" })] });
    const legs = bracketLegs(entry);
    assert.equal(legs.stop?.id, "sl");
    assert.equal(legs.target?.id, "tp");
    assert.equal(brokerExit({ stop: order({ status: "filled", filled_avg_price: "94.8" }), target: null, positionQty: null })?.reason, "STOP");
    assert.equal(brokerExit({ stop: legs.stop, target: legs.target, positionQty: 10 }), null);
  });

  it("protective stop only ratchets up; stock target follows extensions", () => {
    const stop = order({ type: "stop", stop_price: "95" });
    const target = order({ type: "limit", limit_price: "120" });
    assert.deepEqual(protectiveAdjustments({ assetClass: "STOCK", simStop: 100, simTarget: 130, stop, target }), { stopTo: 100, targetTo: 130 });
    assert.deepEqual(protectiveAdjustments({ assetClass: "STOCK", simStop: 90, simTarget: 120, stop, target }), {});
    assert.deepEqual(protectiveAdjustments({ assetClass: "CRYPTO_ALT", simStop: 96, simTarget: 150, stop, target: null }), { stopTo: 96 });
  });
});

describe("AI discretion measurement", () => {
  it("baseline candidates are breakout ≥ 60 only", () => {
    assert.ok(isBaselineCandidate({ setup: "BREAKOUT", score: 64 }));
    assert.ok(!isBaselineCandidate({ setup: "BREAKOUT", score: 50 }));
    assert.ok(!isBaselineCandidate({ setup: "PULLBACK", score: 90 }));
  });

  it("an AI-only winner the baseline would skip counts as agent value", () => {
    const rows: JournalTrade[] = Array.from({ length: 120 }, (_, i) => ({
      id: `d${i}`,
      trigger_id: `t${i}`,
      symbol: "SOL",
      bucket_id: "b",
      track: "DETERMINISTIC",
      execution: "SHADOW",
      realized_r: 1.5,
      agent_risk_multiplier: 1,
      agent_conviction: 4,
      reached_1r: true,
      closed_at: i,
      baseline_enter: false,
    }));
    const r = agentValueReport(rows);
    assert.equal(r.deterministic_expectancy_r, 0);
    assert.equal(r.verdict, "ADDS_VALUE");
  });
});
