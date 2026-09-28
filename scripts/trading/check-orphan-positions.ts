#!/usr/bin/env tsx
/** Print Alpaca paper holdings for orphan-reconcile symbols (AAPL, MSFT, SPY). */
import { alpaca, fromAlpacaPositionSymbol, isAlpacaConfigured, isDustPosition } from "../../lib/trading/broker/alpaca";

const SYMBOLS = ["AAPL", "MSFT", "SPY"];

async function main() {
  if (!isAlpacaConfigured()) {
    console.error("alpaca_not_configured");
    process.exit(1);
  }
  const positions = await alpaca.positions();
  for (const symbol of SYMBOLS) {
    const held = positions.find((p) => fromAlpacaPositionSymbol(p.symbol) === symbol);
    if (!held || isDustPosition(held)) {
      console.log(`${symbol}: flat`);
      continue;
    }
    const qty = Number(held.qty);
    const side = qty < 0 ? "short" : "long";
    console.log(`${symbol}: ${side} qty=${qty} available=${held.qty_available ?? held.qty}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
