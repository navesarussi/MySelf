import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { INTRADAY_PARAMS, M15, M5, buildIntradayFrames, confirmOn5m, detectIntradaySetup, scanIntraday, scoreIntraday } from "../trading/strategy/intraday";
import { RATER_SYSTEM_PROMPT, ratingSchema } from "../trading/agent-rater";
import { ratingValue } from "../trading/metrics";
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
