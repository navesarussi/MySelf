import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INTRADAY_PARAMS, M15, M5, buildIntradayFrames, confirmOn5m, detectIntradaySetup, scanIntraday, scoreIntraday } from "../trading/strategy/intraday";
import { RATER_SYSTEM_PROMPT, ratingSchema } from "../trading/agent-rater";
import { ratingValue } from "../trading/metrics";
import { enforcePlan } from "../trading/agent-rater";
import { selectCryptoUniverse, selectStockUniverse } from "../trading/intraday-universe";
import { EnterError, evaluateSymbol, rankCandidates, validateManualPlan, type FinderCandidate } from "../trading/trade-finder";
import type { Bar } from "../trading/types";

const T0 = Date.UTC(2026, 0, 1);
const SPRING_I = 360;

/** Uptrend (75→99) → sideways range 97–101 → spring below support at SPRING_I → markup. */
function build15m(): Bar[] {
  const bars: Bar[] = [];
  let prev = 75;
  const push = (o: number, h: number, l: number, c: number, v = 1000) => {
    bars.push({ t: T0 + bars.length * M15, o, h, l, c, v });
    prev = c;
  };
  for (let k = 0; k < 300; k++) {
    const c = 75 + (24 * k) / 299 + 0.3 * Math.sin(k);
    push(prev, Math.max(prev, c) + 0.2, Math.min(prev, c) - 0.2, c);
  }
  for (let k = 300; k < SPRING_I; k++) {
    const c = 99 + 2 * Math.sin(((k - 300) * 2 * Math.PI) / 12);
    push(prev, Math.max(prev, c) + 0.2, Math.min(prev, c) - 0.2, c);
  }
  push(96.9, 98.1, 95.8, 98.0, 900); // spring: pierces support, closes back inside, strong close
  for (let k = 1; k <= 12; k++) push(prev, prev + 0.7, prev - 0.1, prev + 0.5);
  return bars;
}

/** Each 15m bar → 3 monotone 5m bars from open to close. */
function split5m(b15: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of b15) {
    for (let j = 0; j < 3; j++) {
      const o = b.o + ((b.c - b.o) * j) / 3;
      const c = b.o + ((b.c - b.o) * (j + 1)) / 3;
      out.push({ t: b.t + j * M5, o, h: j === 1 ? b.h : Math.max(o, c), l: j === 1 ? b.l : Math.min(o, c), c, v: b.v / 3 });
    }
  }
  return out;
}

describe("intraday strategy (15m setup / 5m entry)", () => {
  const b15 = build15m();
  const f = buildIntradayFrames(b15, split5m(b15));

  it("detects a Wyckoff spring out of a tested trading range, stop below the shakeout low", () => {
    const h = detectIntradaySetup(f.s15, SPRING_I);
    assert.ok(h, "expected a setup");
    assert.equal(h.setup, "WYCKOFF_SPRING");
    assert.ok(h.stop < 95.8);
    assert.ok(h.range && h.range.low > 95.8 && h.range.high > 100);
  });

  it("trend filter blocks longs under the 15m EMA200", () => {
    const down = b15.map((b, i) => (i < 300 ? { ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c } : b));
    const fd = buildIntradayFrames(down, split5m(down));
    assert.equal(detectIntradaySetup(fd.s15, SPRING_I), null);
    assert.ok(detectIntradaySetup(fd.s15, SPRING_I, { ...INTRADAY_PARAMS, trend_filter: false }));
  });

  it("5m confirmation is look-ahead free and enforces min stop distance and ≥ 2R", () => {
    const h = detectIntradaySetup(f.s15, SPRING_I)!;
    const armedAt = b15[SPRING_I].t + M15;
    assert.equal(confirmOn5m(f, h, armedAt), null, "nothing can confirm before a 5m bar closes");
    const c = confirmOn5m(f, h, armedAt + INTRADAY_PARAMS.confirm_window_5m * M5);
    assert.ok(c, "expected a confirmation inside the window");
    assert.ok(c.confirm_time > armedAt && c.confirm_time <= armedAt + INTRADAY_PARAMS.confirm_window_5m * M5);
    assert.ok(c.entry >= b15[SPRING_I].c);
    assert.ok(c.stop <= h.stop);
    assert.ok(c.stop_distance >= c.entry * INTRADAY_PARAMS.min_stop_pct - 1e-9);
    assert.ok(c.rr >= INTRADAY_PARAMS.min_rr - 1e-9);
  });

  it("a 5m low through the stop before confirmation kills the setup", () => {
    const h = detectIntradaySetup(f.s15, SPRING_I)!;
    const b5 = split5m(b15).map((b) => (b.t === b15[SPRING_I].t + M15 ? { ...b, l: h.stop - 0.01 } : b));
    const fk = buildIntradayFrames(b15, b5);
    assert.equal(confirmOn5m(fk, h, b15[SPRING_I].t + M15 + 10 * M5), null);
  });

  it("live scan only returns setups whose confirmation already printed", () => {
    const armedAt = b15[SPRING_I].t + M15;
    const found = scanIntraday(f, armedAt + INTRADAY_PARAMS.confirm_window_5m * M5);
    assert.ok(found.some((c) => c.setup_bar_time === b15[SPRING_I].t));
    for (const c of found) assert.ok(c.confirm_time <= armedAt + INTRADAY_PARAMS.confirm_window_5m * M5);
  });

  it("score stays within 0–100", () => {
    const s = scoreIntraday("WYCKOFF_SOS", { volume_ratio: 3, spread_atr: 2, close_position: 0.9, effort_vs_result: 1, range_width_atr: 5, range_support_tests: 5, range_resistance_tests: 5, rsi15: 60, above_ema200_15m: true, ema50_above_ema200_15m: true, atr15_pct: 0.01 });
    assert.ok(s >= 0 && s <= 100);
  });
});

describe("rating-only agent", () => {
  it("contract: integer 1–10 plus a short explanation; never a decision", () => {
    assert.ok(ratingSchema.safeParse({ rating: 7, explanation: "ok" }).success);
    assert.ok(!ratingSchema.safeParse({ rating: 11, explanation: "x" }).success);
    assert.ok(!ratingSchema.safeParse({ rating: 6.5, explanation: "x" }).success);
    assert.match(RATER_SYSTEM_PROMPT, /1–10/);
    assert.match(RATER_SYSTEM_PROMPT, /לא מחליט/);
  });

  it("measures whether the rating predicts realized R", () => {
    const trades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => ({ agent_rating: r, realized_r: (r - 5) / 5 }));
    const v = ratingValue([...trades, { agent_rating: null, realized_r: 1 }]);
    assert.equal(v.rated, 10);
    assert.equal(v.correlation, 1);
    assert.equal(v.high_n, 4);
    assert.equal(v.low_n, 4);
    assert.ok((v.high_expectancy_r ?? 0) > (v.low_expectancy_r ?? 0));
  });
});

describe("search trade", () => {
  const b15 = build15m();
  const f = buildIntradayFrames(b15, split5m(b15));

  it("finds the spring as a live candidate with a valid ≥2R plan at the current price", () => {
    const armedAt = b15[SPRING_I].t + M15;
    const now = armedAt + 2 * M5;
    const sub = buildIntradayFrames(b15.filter((b) => b.t + M15 <= now), split5m(b15).filter((b) => b.t + M5 <= now));
    const lf = { sym: { symbol: "TEST", asset_class: "CRYPTO_ALT" as const, provider_symbol: "TESTUSDT" }, f: sub, lastPrice: sub.s5.bars.at(-1)!.c };
    const c = evaluateSymbol(lf, now, INTRADAY_PARAMS);
    assert.ok(c, "expected a candidate");
    assert.equal(c.setup, "WYCKOFF_SPRING");
    assert.ok(["CONFIRMED", "ARMED"].includes(c.tier));
    assert.ok(c.stop < c.entry && c.rr >= 2 - 1e-9);
    assert.ok(f.s15.bars.length > 0);
  });

  it("ranks by tier first, then deterministic score", () => {
    const base = { symbol: "A", asset_class: "CRYPTO_ALT", setup: "X", price: 1, atr15: 0.01, entry: 1, stop: 0.98, target: 1.04, rr: 2, structural_stop: 0.98, range: null, features: {} as FinderCandidate["features"], setup_bar_time: null } as const;
    const ranked = rankCandidates([
      { ...base, symbol: "W", tier: "WATCH", score: 99 },
      { ...base, symbol: "R", tier: "RECENT", score: 50 },
      { ...base, symbol: "C", tier: "CONFIRMED", score: 40 },
      { ...base, symbol: "C2", tier: "CONFIRMED", score: 70 },
    ]);
    assert.deepEqual(ranked.map((x) => x.symbol), ["C2", "C", "R", "W"]);
  });

  it("agent plan limits are enforced in code", () => {
    const ctx = { price: 100, atr15: 1, minStopPct: 0.012, maxStopAtr: 3, minRr: 2, fallback: { entry: 100, stop: 98, target: 104 } };
    const good = enforcePlan({ rating: 7, explanation: "x", order_type: "LIMIT", entry: 99.5, stop: 98, target: 103 }, ctx);
    assert.equal(good.source, "AGENT");
    assert.equal(good.order_type, "LIMIT");
    assert.ok(good.target >= good.entry + 2 * (good.entry - good.stop) - 1e-9, "target lifted to 2R");
    const limitAbove = enforcePlan({ rating: 5, explanation: "x", order_type: "LIMIT", entry: 101, stop: 98, target: 110 }, ctx);
    assert.equal(limitAbove.order_type, "MARKET");
    assert.equal(limitAbove.entry, 100);
    const tight = enforcePlan({ rating: 5, explanation: "x", order_type: "MARKET", entry: 100, stop: 99.9, target: 110 }, ctx);
    assert.ok(100 - tight.stop >= 100 * 0.012 - 1e-9, "stop widened to the minimum distance");
    const badStop = enforcePlan({ rating: 5, explanation: "x", order_type: "MARKET", entry: 100, stop: 101, target: 110 }, ctx);
    assert.equal(badStop.source, "DETERMINISTIC");
    assert.ok(badStop.stop < badStop.entry && badStop.rr >= 2 - 1e-9);
    const far = enforcePlan({ rating: 5, explanation: "x", order_type: "MARKET", entry: 100, stop: 90, target: 130 }, ctx);
    assert.equal(far.source, "DETERMINISTIC");
  });

  it("manual entry validation: stop below price, explicit target ≥ 2R, untouched target lifted", () => {
    assert.throws(() => validateManualPlan({ order_type: "MARKET", live: 97, stop: 98, target: 104, minStopPct: 0.012, userEditedTarget: false }), (e: unknown) => e instanceof EnterError && e.code === "price_below_stop");
    assert.throws(() => validateManualPlan({ order_type: "MARKET", live: 100, stop: 98, target: 103, minStopPct: 0.012, userEditedTarget: true }), (e: unknown) => e instanceof EnterError && e.code === "target_below_2r");
    const lifted = validateManualPlan({ order_type: "MARKET", live: 100.5, stop: 98, target: 104, minStopPct: 0.012, userEditedTarget: false });
    assert.ok(lifted.target >= 100.5 + 2 * 2.5 - 1e-9);
    assert.deepEqual(lifted.notes, ["target_lifted_to_2r"]);
    assert.throws(() => validateManualPlan({ order_type: "MARKET", live: 100, stop: 99.9, target: 110, minStopPct: 0.012, userEditedTarget: false }), (e: unknown) => e instanceof EnterError && e.code === "stop_too_tight");
    const limit = validateManualPlan({ order_type: "LIMIT", live: 100, entry: 99, stop: 97, target: 103, minStopPct: 0.012, userEditedTarget: false });
    assert.equal(limit.entry, 99);
  });
});

describe("intraday universe selection", () => {
  it("crypto: volume floor, no stables/gold/tokenized stocks, Alpaca flag", () => {
    const rows = selectCryptoUniverse(
      [
        { symbol: "BTCUSDT", quoteVolume: "900000000", lastPrice: "77000" },
        { symbol: "USDCUSDT", quoteVolume: "500000000", lastPrice: "1" },
        { symbol: "PAXGUSDT", quoteVolume: "50000000", lastPrice: "3000" },
        { symbol: "SOXLBUSDT", quoteVolume: "30000000", lastPrice: "40" },
        { symbol: "TINYUSDT", quoteVolume: "1000000", lastPrice: "1" },
        { symbol: "ZECUSDT", quoteVolume: "150000000", lastPrice: "50" },
        { symbol: "ETHBTC", quoteVolume: "999999999", lastPrice: "0.03" },
      ],
      { stockSymbols: new Set(["SOXL"]), alpacaBases: new Set(["BTC"]) }
    );
    assert.deepEqual(rows.map((r) => r.symbol), ["BTC", "ZEC"]);
    assert.equal(rows[0].asset_class, "CRYPTO_MAJOR");
    assert.equal(rows[0].broker_tradable, true);
    assert.equal(rows[1].broker_tradable, false);
  });

  it("stocks: price, dollar volume and ATR floors; SPY kept as context", () => {
    const day = (i: number, c: number, range: number, v: number) => ({ t: i * 86_400_000, o: c, h: c + range / 2, l: c - range / 2, c, v });
    const series = (c: number, range: number, v: number) => Array.from({ length: 25 }, (_, i) => day(i, c, range, v));
    const daily = new Map([
      ["LIQ", series(100, 3, 1_000_000)], // $100M/day, 3% ATR
      ["CALM", series(100, 0.5, 1_000_000)], // too quiet
      ["THIN", series(100, 3, 100_000)], // $10M/day
      ["PENNY", series(3, 0.3, 50_000_000)], // price < $5
      ["SPY", series(500, 3, 1_000_000)],
    ]);
    const rows = selectStockUniverse(daily);
    assert.deepEqual(rows.map((r) => r.symbol).sort(), ["LIQ", "SPY"]);
  });
});
