import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { equityFromTrades } from "../trading/account-equity";
import type { TradeRow, TradingSettings } from "../trading/store";
import { getBrokerStatus } from "../trading/service-dashboard";

const settings = {
  starting_equity: 10_000,
  peak_equity: 10_000,
} as TradingSettings;

describe("getDashboardOverview equity path", () => {
  it("uses entry_price fallback when live marks are omitted", () => {
    const open = [
      {
        symbol: "BTC",
        sim_state: { entry_price: 100, cash_flow: -100, size: 1, stop_price: 90, stop_distance: 10, target_price: 120, exit_plan: "FIXED_2R" },
      },
    ] as unknown as TradeRow[];
    const equity = equityFromTrades(settings, open, [], new Map());
    assert.equal(equity, 10_000);
  });
});

describe("getBrokerStatus", () => {
  it("returns offline stub when Alpaca is not configured", async () => {
    const status = await getBrokerStatus("ALPACA_PAPER");
    assert.equal(status.configured, false);
    assert.equal(status.connected, false);
  });
});
