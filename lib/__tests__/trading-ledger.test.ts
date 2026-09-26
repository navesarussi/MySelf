import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALPACA_CRYPTO_SELL_FEE_RATE, settleTrade, type BrokerFill } from "../trading/broker/ledger";
import { tradeWindows } from "../trading/broker/settle";
import { isDustPosition } from "../trading/broker/alpaca";
import { isAccountTrade } from "../trading/store";
import { scannableSymbols } from "../trading/intraday-trade";
import type { IntradayUniverseRow } from "../trading/intraday-universe";

const fill = (order_id: string, side: "buy" | "sell", qty: number, price: number, at: number): BrokerFill => ({ order_id, side, qty, price, at });

describe("settleTrade (books from Alpaca fills)", () => {
  it("books a crypto stop-out from the real fills: VWAP entry, in-kind buy fee, USD sell fee", () => {
    const s = settleTrade({
      assetClass: "CRYPTO_ALT",
      entryOrderId: "in",
      initialStop: 9.6,
      plannedRisk: 40,
      fills: [
        fill("in", "buy", 60, 10, 1),
        fill("in", "buy", 40, 10, 2),
        // The buy fee took 0.2 units; the stop sold what was left, below the stop price.
        fill("sl", "sell", 99.8, 9.5, 10),
      ],
    });
    assert.ok(s);
    const sellFee = 99.8 * 9.5 * ALPACA_CRYPTO_SELL_FEE_RATE;
    assert.equal(s.entry_qty, 100);
    assert.equal(s.entry_price, 10);
    assert.equal(s.exit_price, 9.5);
    assert.ok(Math.abs(s.pnl - (99.8 * 9.5 - 1000 - sellFee)) < 1e-9);
    assert.ok(Math.abs(s.fees - (0.2 * 10 + sellFee)) < 1e-9);
    assert.ok(Math.abs(s.r - s.pnl / 40) < 1e-9);
    assert.ok(s.r < -1.3 && s.r > -1.4);
    assert.equal(s.closed_at, 10);
  });

  it("does not let fee dust sold after the exit rewrite the trade (PEPE −54R)", () => {
    const qty = 6_013_395_878.315233;
    const s = settleTrade({
      assetClass: "CRYPTO_ALT",
      entryOrderId: "in",
      initialStop: 0.000004873016510760536,
      plannedRisk: 552.89,
      fills: [fill("in", "buy", qty, 0.000004965, 1), fill("sl", "sell", qty * 0.9985, 0.00000484, 5), fill("dust", "sell", 7.2e-7, 0.00000484, 9)],
    });
    assert.ok(s);
    assert.ok(s.r > -1.6 && s.r < -1.3, `r=${s.r}`);
    assert.ok(s.pnl > -1_000 && s.pnl < -700, `pnl=${s.pnl}`);
  });

  it("waits while the sells do not cover the position", () => {
    const s = settleTrade({ assetClass: "CRYPTO_ALT", entryOrderId: "in", initialStop: 9, plannedRisk: 100, fills: [fill("in", "buy", 100, 10, 1), fill("x", "sell", 50, 11, 2)] });
    assert.equal(s, null);
  });

  it("returns null without an entry fill, and ignores sells from before the entry", () => {
    assert.equal(settleTrade({ assetClass: "STOCK", entryOrderId: "in", initialStop: 9, plannedRisk: 100, fills: [fill("x", "sell", 10, 11, 2)] }), null);
    const s = settleTrade({ assetClass: "STOCK", entryOrderId: "in", initialStop: 9, plannedRisk: 10, fills: [fill("old", "sell", 10, 50, 0), fill("in", "buy", 10, 10, 1), fill("tp", "sell", 10, 12, 3)] });
    assert.ok(s);
    assert.equal(s.exit_price, 12);
    assert.equal(s.pnl, 20); // stocks: commission-free
    assert.equal(s.r, 2);
  });

  it("measures a small partial fill against the planned risk, not its own sliver", () => {
    // Planned 100 units (risk 100); only 5 filled and ran +3 each.
    const s = settleTrade({ assetClass: "STOCK", entryOrderId: "in", initialStop: 9, plannedRisk: 100, fills: [fill("in", "buy", 5, 10, 1), fill("x", "sell", 5, 13, 2)] });
    assert.ok(s);
    assert.equal(s.risk, 100);
    assert.equal(s.r, 0.15);
  });

  it("measures R against the planned risk when the fill landed at or through the stop", () => {
    const s = settleTrade({ assetClass: "STOCK", entryOrderId: "in", initialStop: 10, plannedRisk: 50, fills: [fill("in", "buy", 10, 10, 1), fill("sl", "sell", 10, 9.5, 2)] });
    assert.ok(s);
    assert.equal(s.risk, 50);
    assert.equal(s.r, -0.1);
  });
});

describe("tradeWindows", () => {
  it("gives each trade the symbol's fills until the next trade on that symbol", () => {
    const w = tradeWindows([
      { id: "a", symbol: "SOL", created_at: "2026-09-20T00:00:00Z" },
      { id: "b", symbol: "SOL", created_at: "2026-09-21T00:00:00Z" },
      { id: "c", symbol: "BTC", created_at: "2026-09-20T12:00:00Z" },
    ]);
    assert.equal(w.get("a")!.to, Date.parse("2026-09-21T00:00:00Z") - 1);
    assert.equal(w.get("b")!.to, Infinity);
    assert.equal(w.get("c")!.to, Infinity);
    assert.equal(w.get("a")!.from, Date.parse("2026-09-20T00:00:00Z") - 60_000);
  });
});

describe("real trades only", () => {
  it("treats fee dust as flat", () => {
    assert.equal(isDustPosition({ qty: "0.000000183", current_price: "120", market_value: "0.000022" }), true);
    assert.equal(isDustPosition({ qty: "0.0000007", current_price: "0.0000048" }), true);
    assert.equal(isDustPosition(null), true);
    assert.equal(isDustPosition({ qty: "3070.98", current_price: "9.57", market_value: "29389.36" }), false);
  });

  it("counts only trades that went to the broker toward the demo account", () => {
    assert.equal(isAccountTrade({ track: "AGENT", execution: "PAPER", broker: null }, "PAPER"), false);
    assert.equal(isAccountTrade({ track: "AGENT", execution: "PAPER", broker: "ALPACA_PAPER" }, "PAPER"), true);
    assert.equal(isAccountTrade({ track: "DETERMINISTIC", execution: "SHADOW", broker: null }, "PAPER"), false);
  });

  it("scans only what Alpaca can trade", () => {
    const row = (symbol: string, broker_tradable: boolean, asset_class: IntradayUniverseRow["asset_class"] = "CRYPTO_ALT"): IntradayUniverseRow => ({ symbol, asset_class, provider_symbol: `${symbol}USDT`, dollar_volume: 1, atr_pct: null, price: 1, broker_tradable, rank: 1 });
    const out = scannableSymbols([row("SOL", true), row("ASTER", false), row("NVDA", true, "STOCK")], { open: false, canEnter: false, mustFlatten: true });
    assert.deepEqual(out.map((u) => u.symbol), ["SOL"]);
  });
});
