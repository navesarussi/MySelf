import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { macd } from "../trading/indicators";
import { mulberry32 } from "../trading/metrics";
import {
  COMMITTEE_FEATURE_KEYS,
  dailyTrendToOpportunityTicket,
  opportunityTicketId,
  tradeFinderToOpportunityTicket,
  v2SwingToOpportunityTicket,
} from "../trading/committee";
import { buildDailyAsset, DEFAULT_DAILY_TREND, scanDailyTrendCandidates, scoreDailyCandidate } from "../trading/strategy/daily-trend";
import { DEFAULT_V2_PARAMS, evaluateCandidates } from "../trading/strategy/candidates";
import { framesFromBars } from "../trading/strategy/data-v2";
import { buildIntradayFrames, INTRADAY_PARAMS, M15, M5 } from "../trading/strategy/intraday";
import { evaluateSymbol } from "../trading/trade-finder";
import type { Bar } from "../trading/types";

function syntheticFrames(symbol: string, seed: number, hours = 24 * 500) {
  const rand = mulberry32(seed);
  const h1: Bar[] = [];
  let price = 100;
  for (let i = 0; i < hours; i++) {
    const o = price;
    const regime = Math.floor(i / 400) % 3;
    const vol = regime === 1 ? 0.002 : 0.009;
    price = price * (1 + 0.00012 + (rand() - 0.5) * vol * 2);
    h1.push({ t: i * 3_600_000, o, h: Math.max(o, price) * (1 + rand() * 0.002), l: Math.min(o, price) * (1 - rand() * 0.002), c: price, v: 1000 * (regime === 1 ? 0.6 : 1.4) + rand() * 400 });
  }
  const d1: Bar[] = [];
  for (let d = 0; d * 24 < h1.length; d++) {
    const ch = h1.slice(d * 24, d * 24 + 24);
    d1.push({ t: d * 86_400_000, o: ch[0].o, h: Math.max(...ch.map((b) => b.h)), l: Math.min(...ch.map((b) => b.l)), c: ch[ch.length - 1].c, v: ch.reduce((s, b) => s + b.v, 0) });
  }
  return framesFromBars({ symbol, asset_class: "CRYPTO_ALT", provider_symbol: symbol }, h1, d1);
}

function dailySeries(seed: number, days = 900, drift = 0.0008): Bar[] {
  const rand = mulberry32(seed);
  const bars: Bar[] = [];
  let p = 100;
  for (let i = 0; i < days; i++) {
    const o = p;
    p = p * (1 + drift + (rand() - 0.5) * 0.04);
    bars.push({ t: i * 86_400_000, o, h: Math.max(o, p) * (1 + rand() * 0.01), l: Math.min(o, p) * (1 - rand() * 0.01), c: p, v: 1e6 * (0.5 + rand()) });
  }
  return bars;
}

const T0 = Date.UTC(2026, 0, 1);
const SPRING_I = 360;

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
  push(96.9, 98.1, 95.8, 98.0, 900);
  for (let k = 1; k <= 12; k++) push(prev, prev + 0.7, prev - 0.1, prev + 0.5);
  return bars;
}

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

describe("MACD helper", () => {
  it("produces hist/signal after warm-up on synthetic closes", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 2);
    const { signal, hist } = macd(closes);
    const last = closes.length - 1;
    assert.ok(Number.isFinite(signal[last]), "signal should be finite at last bar");
    assert.ok(Number.isFinite(hist[last]), "hist should be finite at last bar");
    assert.ok(Number.isNaN(hist[10]), "hist should be NaN early in series");
  });
});

describe("v2 swing adapter", () => {
  const frames = syntheticFrames("AAA", 7);

  it("maps a real candidate to a valid OpportunityTicket", () => {
    let mapped = false;
    for (let i = 250; i < frames.h4.bars.length; i++) {
      const t = frames.h4.bars[i].t + frames.h4.ms;
      for (const c of evaluateCandidates(frames, t, { reference_ok: true, rs_rank: 0.9, breadth: 0.8 }, { ...DEFAULT_V2_PARAMS, min_score: 0 }).candidates) {
        const r = v2SwingToOpportunityTicket({ candidate: c, frames, market: { reference_ok: true, rs_rank: 0.9, breadth: 0.8 } });
        assert.equal(r.ok, true, r.ok ? "" : r.error);
        if (r.ok) {
          assert.equal(r.data.strategy, "V2_SWING");
          assert.equal(r.data.id, opportunityTicketId(c.symbol, "V2_SWING", r.data.bar_time));
          assert.ok(r.data.features.macd_hist !== null || r.data.features.macd_signal !== null, "MACD features when bars allow");
          for (const k of COMMITTEE_FEATURE_KEYS) assert.ok(k in r.data.features, `missing feature key ${k}`);
          mapped = true;
        }
      }
    }
    assert.ok(mapped, "expected at least one adapter mapping");
  });

  it("rejects bad geometry (stop at entry)", () => {
    const t = frames.h4.bars[400].t + frames.h4.ms;
    const cands = evaluateCandidates(frames, t, { reference_ok: true, rs_rank: 0.5, breadth: 0.5 }, { ...DEFAULT_V2_PARAMS, min_score: 0 }).candidates;
    if (!cands.length) return;
    const bad = { ...cands[0], stop: cands[0].entry };
    const r = v2SwingToOpportunityTicket({ candidate: bad, frames, market: { reference_ok: true, rs_rank: 0.5, breadth: 0.5 } });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /stop must be below entry/);
  });

  it("ticket id is stable for same symbol+strategy+bar_time", () => {
    const t = frames.h4.bars[400].t + frames.h4.ms;
    for (const c of evaluateCandidates(frames, t, { reference_ok: true, rs_rank: 0.5, breadth: 0.5 }, { ...DEFAULT_V2_PARAMS, min_score: 0 }).candidates.slice(0, 1)) {
      const a = v2SwingToOpportunityTicket({ candidate: c, frames, market: { reference_ok: true, rs_rank: 0.5, breadth: 0.5 } });
      const b = v2SwingToOpportunityTicket({ candidate: c, frames, market: { reference_ok: true, rs_rank: 0.5, breadth: 0.5 } });
      assert.equal(a.ok, true);
      assert.equal(b.ok, true);
      if (a.ok && b.ok) assert.equal(a.data.id, b.data.id);
    }
  });
});

describe("daily trend adapter", () => {
  const assets = [1, 2, 3, 4].map((k) => buildDailyAsset(`S${k}`, "STOCK", "STOCKS", dailySeries(k)));
  const params = { ...DEFAULT_DAILY_TREND, require_reference: false };

  function firstDailyCandidate() {
    for (let t = 260 * 86_400_000; t <= 899 * 86_400_000; t += 86_400_000) {
      const cands = scanDailyTrendCandidates(assets, t, {}, params);
      if (cands.length) return cands[0];
    }
    return null;
  }

  it("maps scanDailyTrendCandidates output to a valid ticket with MACD", () => {
    const c = firstDailyCandidate();
    assert.ok(c, "fixture should yield daily candidates");
    const score = scoreDailyCandidate(c!.features, c!.rs);
    const r = dailyTrendToOpportunityTicket({ candidate: c!, score });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    if (r.ok) {
      assert.equal(r.data.strategy, "DAILY_TREND");
      assert.equal(r.data.id, opportunityTicketId(c!.symbol, "DAILY_TREND", r.data.bar_time));
      assert.ok(r.data.features.macd_hist !== null || r.data.features.macd_signal !== null);
    }
  });

  it("rejects stop above entry", () => {
    const c = firstDailyCandidate();
    if (!c) return;
    const bad = { ...c, stop: c.entry + 1 };
    const r = dailyTrendToOpportunityTicket({ candidate: bad, score: 50 });
    assert.equal(r.ok, false);
  });

  it("stable ticket id across repeated calls", () => {
    const c = firstDailyCandidate();
    if (!c) return;
    const a = dailyTrendToOpportunityTicket({ candidate: c, score: 60 });
    const b = dailyTrendToOpportunityTicket({ candidate: c, score: 60 });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && b.ok) assert.equal(a.data.id, b.data.id);
  });
});

describe("trade-finder adapter", () => {
  const b15 = build15m();
  const f = buildIntradayFrames(b15, split5m(b15));

  it("maps evaluateSymbol output to MANUAL_FINDER ticket", () => {
    const armedAt = b15[SPRING_I].t + M15;
    const now = armedAt + 2 * M5;
    const sub = buildIntradayFrames(b15.filter((b) => b.t + M15 <= now), split5m(b15).filter((b) => b.t + M5 <= now));
    const lf = { sym: { symbol: "TEST", asset_class: "CRYPTO_ALT" as const, provider_symbol: "TESTUSDT" }, f: sub, lastPrice: sub.s5.bars.at(-1)!.c };
    const c = evaluateSymbol(lf, now, INTRADAY_PARAMS);
    assert.ok(c);
    const r = tradeFinderToOpportunityTicket({ candidate: c!, s15: sub.s15 });
    assert.equal(r.ok, true, r.ok ? "" : r.error);
    if (r.ok) {
      assert.equal(r.data.strategy, "MANUAL_FINDER");
      assert.equal(r.data.id, opportunityTicketId(c!.symbol, "MANUAL_FINDER", r.data.bar_time));
      assert.ok(r.data.features.macd_hist !== null || r.data.features.macd_signal !== null);
    }
  });

  it("rejects WATCH tier without setup_bar_time", () => {
    const r = tradeFinderToOpportunityTicket({
      candidate: {
        symbol: "X",
        asset_class: "CRYPTO_ALT",
        tier: "WATCH",
        setup: "TREND_WATCH",
        score: 40,
        price: 100,
        atr15: 1,
        entry: 100,
        stop: 98,
        target: 104,
        rr: 2,
        structural_stop: 98,
        range: null,
        features: { volume_ratio: 1, spread_atr: 1, close_position: 0.5, effort_vs_result: 1, range_width_atr: null, range_support_tests: null, range_resistance_tests: null, rsi15: 55, above_ema200_15m: true, ema50_above_ema200_15m: true, atr15_pct: 0.01 },
        setup_bar_time: null,
      },
      s15: f.s15,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /MISSING_SETUP_BAR_TIME/);
  });

  it("rejects bad geometry", () => {
    const r = tradeFinderToOpportunityTicket({
      candidate: {
        symbol: "X",
        asset_class: "CRYPTO_ALT",
        tier: "CONFIRMED",
        setup: "BREAKOUT_15M",
        score: 80,
        price: 100,
        atr15: 1,
        entry: 100,
        stop: 101,
        target: 110,
        rr: 2,
        structural_stop: 101,
        range: null,
        features: { volume_ratio: 1, spread_atr: 1, close_position: 0.5, effort_vs_result: 1, range_width_atr: null, range_support_tests: null, range_resistance_tests: null, rsi15: 55, above_ema200_15m: true, ema50_above_ema200_15m: true, atr15_pct: 0.01 },
        setup_bar_time: b15[SPRING_I].t,
      },
      s15: f.s15,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /INVALID_GEOMETRY|stop must be below entry/);
  });
});
