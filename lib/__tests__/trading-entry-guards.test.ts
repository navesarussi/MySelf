import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENTRY_GUARDS, EXECUTION_RULES } from "../trading/config";
import {
  avgDollarVolumeFromBars,
  checkEntryGuardPre,
  guardStopDistance,
  maxEntryNotional,
  sizeNotionalWithGuards,
  sizeWithEntryGuards,
} from "../trading/entry-guards";
import { buildTradePlan } from "../trading/sizing";
import type { Bar } from "../trading/types";

const bars = (closes: number[], vol = 1_000_000): Bar[] =>
  closes.map((c, i) => ({ t: i * 86_400_000, o: c, h: c, l: c, c, v: vol }));

describe("entry guard config", () => {
  it("documents sensible defaults", () => {
    assert.equal(ENTRY_GUARDS.MIN_STOCK_PRICE, 5);
    assert.equal(ENTRY_GUARDS.MAX_POSITION_NOTIONAL_PCT, 0.1);
    assert.equal(ENTRY_GUARDS.MAX_POSITION_NOTIONAL_USD, 25_000);
    assert.equal(ENTRY_GUARDS.MIN_STOP_DISTANCE_PCT, 0.005);
    assert.ok(ENTRY_GUARDS.CRYPTO_DENYLIST.includes("GRAM"));
  });
});

describe("guardStopDistance", () => {
  it("floors tight stops at 0.5% of entry for sizing", () => {
    assert.equal(guardStopDistance(100, 99.9), 0.5);
    assert.equal(guardStopDistance(100, 94), 6);
  });
});

describe("checkEntryGuardPre", () => {
  const base = { symbol: "AAPL", asset_class: "STOCK" as const, entry: 150, stop: 140, equity: 100_000, buying_power: 50_000 };

  it("rejects penny stocks", () => {
    const b = checkEntryGuardPre({ ...base, symbol: "PENNY", entry: 3.5 });
    assert.equal(b?.reason, "MIN_STOCK_PRICE");
  });

  it("rejects illiquid stocks when ADTV is known", () => {
    const b = checkEntryGuardPre({ ...base, avg_dollar_volume: 5_000_000 });
    assert.equal(b?.reason, "MIN_STOCK_LIQUIDITY");
  });

  it("blocks denylisted crypto", () => {
    const b = checkEntryGuardPre({ symbol: "GRAM", asset_class: "CRYPTO_ALT", entry: 0.05, stop: 0.04, equity: 100_000, buying_power: 10_000 });
    assert.equal(b?.reason, "CRYPTO_DENYLIST");
  });

  it("flags low-volume crypto when quote volume is known", () => {
    const b = checkEntryGuardPre({ symbol: "DOT", asset_class: "CRYPTO_ALT", entry: 4, stop: 3.5, equity: 100_000, buying_power: 10_000, quote_volume_24h: 1_000_000 });
    assert.equal(b?.reason, "CRYPTO_LOW_VOLUME");
  });
});

describe("maxEntryNotional", () => {
  it("caps by equity pct, absolute USD, and buying power buffer", () => {
    assert.equal(maxEntryNotional({ equity: 100_000, buying_power: null }), 10_000);
    assert.equal(maxEntryNotional({ equity: 500_000, buying_power: null }), 25_000);
    assert.equal(maxEntryNotional({ equity: 100_000, buying_power: 5_000 }), 4_750);
  });
});

describe("sizeWithEntryGuards", () => {
  it("shrinks oversized positions from tight stops via guard floor", () => {
    const s = sizeWithEntryGuards({ entry: 100, stop: 99.9, equity: 100_000, asset_class: "STOCK", risk_pct: 0.005, buying_power: null });
    assert.ok(s);
    assert.equal(s!.size, 100);
    assert.equal(s!.notional, 10_000);
  });

  it("returns block when below min order notional", () => {
    const s = sizeWithEntryGuards({ entry: 50, stop: 49.75, equity: 100_000, asset_class: "STOCK", risk_pct: 0.0000025, buying_power: null });
    assert.ok(s?.block);
    assert.equal(s!.block!.reason, "MIN_ORDER_NOTIONAL");
  });

  it("respects buying power buffer", () => {
    const s = sizeWithEntryGuards({ entry: 100, stop: 95, equity: 100_000, asset_class: "STOCK", risk_pct: 0.0015, buying_power: 1_000 });
    assert.equal(s?.size, 9);
  });
});

describe("sizeNotionalWithGuards", () => {
  it("caps IBS-style notional entries", () => {
    const s = sizeNotionalWithGuards({ entry: 100, stop: 95, target_notional: 50_000, equity: 100_000, buying_power: 20_000 });
    assert.ok(s);
    assert.equal(s!.size, 100);
    assert.ok(s!.reduced);
  });
});

describe("buildTradePlan integration", () => {
  it("uses guard notional cap instead of legacy 20% exposure", () => {
    const plan = buildTradePlan({ entry: 100, stopDistance: 1, equity: 100_000, assetClass: "CRYPTO_MAJOR", riskScale: 1 })!;
    assert.ok(plan.notional <= ENTRY_GUARDS.MAX_POSITION_NOTIONAL_PCT * 100_000 + 1e-6);
  });
});

describe("avgDollarVolumeFromBars", () => {
  it("averages close×volume over lookback", () => {
    const adv = avgDollarVolumeFromBars(bars(Array(20).fill(10), 2_000_000));
    assert.equal(adv, 20_000_000);
  });
});

describe("buying power guard", () => {
  it("never sizes above buffered buying power", () => {
    const bp = 8_000;
    const plan = buildTradePlan({ entry: 50, stopDistance: 2, equity: 200_000, assetClass: "STOCK", riskScale: 1, maxNotional: bp * ENTRY_GUARDS.BUYING_POWER_BUFFER })!;
    assert.ok(plan.notional <= bp * ENTRY_GUARDS.BUYING_POWER_BUFFER + 1e-6);
    assert.ok(plan.notional >= EXECUTION_RULES.MIN_ORDER_NOTIONAL);
  });
});
