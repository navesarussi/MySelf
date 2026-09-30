import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newPendingPosition, type SimPosition } from "../trading/position";
import { strategyChoices } from "../trading/strategy-options";
import { planStrategyMove, StrategyMoveError } from "../trading/trade-strategy";
import { NO_TARGET_R } from "../trading/trade-edit";

const open = (over: Partial<SimPosition> = {}): SimPosition => ({ ...newPendingPosition({ asset_class: "STOCK", entry: 100, stop: 95, size: 10 }), state: "OPEN", entry_price: 100, stop_distance: 5, size: 10, ...over });
const trade = (symbol: string, setup: string | null, asset_class = "STOCK", sim = open()) => ({ symbol, asset_class, setup, strategy_version: "book", state: "OPEN" as const, sim_state: sim }) as never;

describe("strategy choices", () => {
  it("offers stock strategies, the ETF sleeves only for their lists, crypto only crypto, never the current one", () => {
    assert.deepEqual(strategyChoices({ symbol: "NVDA", asset_class: "STOCK", setup: "REVERSAL" }), ["MOMENTUM", "MANUAL"]);
    assert.deepEqual(strategyChoices({ symbol: "SPY", asset_class: "STOCK", setup: "MOMENTUM" }), ["REVERSAL", "ASSET_ROTATION", "IBS_CLOSE", "MANUAL"]);
    assert.deepEqual(strategyChoices({ symbol: "TLT", asset_class: "STOCK", setup: null }), ["REVERSAL", "MOMENTUM", "ASSET_ROTATION"]);
    assert.deepEqual(strategyChoices({ symbol: "SOL", asset_class: "CRYPTO_ALT", setup: "CRYPTO_TREND" }), ["MANUAL"]);
  });
});

describe("strategy move plan", () => {
  it("gives the bracket strategy a real 1.5R take-profit", () => {
    const plan = planStrategyMove(trade("SPY", "REVERSAL"), "IBS_CLOSE");
    assert.equal(plan.target, 107.5);
    assert.equal(plan.sim.target_price, 107.5);
  });
  it("gives signal strategies the no-target placeholder and their management", () => {
    const plan = planStrategyMove(trade("SPY", "IBS_CLOSE", "STOCK", open({ target_price: 107.5 })), "REVERSAL");
    assert.equal(plan.target, 100 + NO_TARGET_R * 5);
    assert.equal(plan.sim.trail_after_r, null);
  });
  it("keeps the levels when moved to manual", () => {
    const plan = planStrategyMove(trade("NVDA", "REVERSAL", "STOCK", open({ target_price: 120 })), "MANUAL");
    assert.equal(plan.target, 120);
    assert.deepEqual(plan.sim, {});
  });
  it("refuses a strategy the symbol does not belong to, and unfilled trades", () => {
    assert.throws(() => planStrategyMove(trade("NVDA", "REVERSAL"), "IBS_CLOSE"), StrategyMoveError);
    assert.throws(() => planStrategyMove(trade("NVDA", "REVERSAL", "STOCK", open({ entry_price: null })), "MOMENTUM"), /no_fill_yet/);
  });
});
