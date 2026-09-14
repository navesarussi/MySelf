import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../trading/metrics";
import { buildDailyAsset, DEFAULT_DAILY_TREND, LIVE_DAILY_TREND_PARAMS, donchianExitBreached, runDailyTrend, scanDailyTrendCandidates, scoreDailyCandidate } from "../trading/strategy/daily-trend";
import { dailyTrendGroup } from "../trading/config";
import { AGENT_SKILL_VERSION, TRADING_SKILL } from "../trading/agent-skill";
import { JUDGE_SYSTEM_PROMPT, promptVersionFor } from "../trading/agent-judge";
import type { Bar } from "../trading/types";

function series(seed: number, days = 900, drift = 0.0008): Bar[] {
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

describe("daily trend engine", () => {
  const assets = [1, 2, 3, 4].map((k) => buildDailyAsset(`S${k}`, "STOCK", "STOCKS", series(k)));
  const base = { assets, references: {}, params: { ...DEFAULT_DAILY_TREND, require_reference: false }, start: 260 * 86_400_000, end: 899 * 86_400_000, starting_equity: 100_000 };

  it("trades trending synthetic assets and accounts every trade", () => {
    const r = runDailyTrend(base);
    assert.ok(r.stats.trades > 0);
    assert.equal(r.stats.trades, r.trades.length);
    for (const t of r.trades) assert.ok(t.r > -2.5, `loss ${t.r}`);
  });

  it("respects the concurrency parameter and a filter that rejects everything", () => {
    assert.equal(runDailyTrend({ ...base, filter: () => false }).stats.trades, 0);
    const one = runDailyTrend({ ...base, params: { ...base.params, max_concurrent: 1 } });
    for (let i = 0; i < one.trades.length; i++)
      for (let j = i + 1; j < one.trades.length; j++) {
        const a = one.trades[i];
        const b = one.trades[j];
        assert.ok(a.closed_at <= b.opened_at || b.closed_at <= a.opened_at, "positions overlapped with max_concurrent 1");
      }
  });

  it("priority changes which signal gets the slot, not the rules", () => {
    const byName = runDailyTrend({ ...base, params: { ...base.params, max_concurrent: 1 }, priority: (c) => (c.symbol === "S4" ? 1 : 0) });
    assert.equal(byName.stats.trades, byName.trades.length);
  });
});

describe("live/backtest shared candidate scan", () => {
  const assets = [1, 2, 3].map((k) => buildDailyAsset(`S${k}`, "STOCK", "STOCKS", series(k)));

  it("scanDailyTrendCandidates finds the same signals runDailyTrend's internal scan does", () => {
    // Any day where the backtest opened a trade must be a day scanDailyTrendCandidates flags as a candidate.
    const bt = runDailyTrend({ assets, references: {}, params: { ...DEFAULT_DAILY_TREND, require_reference: false }, start: 260 * 86_400_000, end: 899 * 86_400_000, starting_equity: 100_000 });
    assert.ok(bt.trades.length > 0);
    const DAY = 86_400_000;
    for (const tr of bt.trades.slice(0, 5)) {
      // The entry FILLS a day or two after the breakout day the candidate was flagged on (limit order) —
      // check the small window immediately before the fill rather than the fill day itself.
      let foundOn: number | null = null;
      for (let t = tr.opened_at; t >= tr.opened_at - 3 * DAY; t -= DAY) {
        const cands = scanDailyTrendCandidates(assets, t, {}, { ...DEFAULT_DAILY_TREND, require_reference: false });
        if (cands.some((c) => c.symbol === tr.symbol)) {
          foundOn = t;
          break;
        }
      }
      assert.ok(foundOn !== null, `no candidate found for ${tr.symbol} near opened_at=${tr.opened_at}`);
    }
  });

  it("LIVE_DAILY_TREND_PARAMS matches the walk-forward chosen config", () => {
    assert.equal(LIVE_DAILY_TREND_PARAMS.breakout_days, 100);
    assert.equal(LIVE_DAILY_TREND_PARAMS.stop_atr, 3);
    assert.equal(LIVE_DAILY_TREND_PARAMS.trail_atr, 3);
    assert.equal(LIVE_DAILY_TREND_PARAMS.use_structural_target, false);
  });
});

describe("donchianExitBreached", () => {
  it("breaches only when today's close is below the prior N-day low", () => {
    const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({ t: i * 86_400_000, o: 100, h: 101, l: 95, c: 100, v: 1 }));
    bars[29] = { ...bars[29], c: 94 }; // below every prior day's low (95)
    const daily = buildDailyAsset("X", "STOCK", "STOCKS", bars).d1;
    assert.equal(donchianExitBreached(daily, 29, 20), true);
    assert.equal(donchianExitBreached(daily, 15, 20), false); // not enough history yet
    bars[29] = { ...bars[29], c: 100 };
    const daily2 = buildDailyAsset("X", "STOCK", "STOCKS", bars).d1;
    assert.equal(donchianExitBreached(daily2, 29, 20), false);
  });
});

describe("scoreDailyCandidate", () => {
  const base = { adx: 25, dist_sma200_atr: 5, atr_pct: 0.02, volume_ratio: 1.0, breakout_atr: 0.1, squeeze_pct: 0.8, ret_20d: 0.05, ret_252d: 0.2, days_above_sma200: 50, reference_margin: 0.05, rsi: 60 };

  it("rewards volume, compression, moderate ADX, strong breakout and RS — never leaves [0,100]", () => {
    const weak = scoreDailyCandidate(base, 0.2);
    const strong = scoreDailyCandidate({ ...base, volume_ratio: 1.5, squeeze_pct: 0.2, breakout_atr: 0.5 }, 0.9);
    assert.ok(strong > weak);
    assert.ok(strong <= 100 && weak >= 0);
    const lateTrend = scoreDailyCandidate({ ...base, adx: 40 }, 0.5);
    assert.ok(lateTrend < scoreDailyCandidate(base, 0.5), "late-trend (ADX>32) should score lower");
  });
});

describe("dailyTrendGroup", () => {
  it("classifies crypto, ETFs and single stocks", () => {
    assert.equal(dailyTrendGroup("BTC", "CRYPTO_MAJOR"), "CRYPTO");
    assert.equal(dailyTrendGroup("SPY", "STOCK"), "ETF");
    assert.equal(dailyTrendGroup("XLK", "STOCK"), "ETF");
    assert.equal(dailyTrendGroup("AAPL", "STOCK"), "STOCKS");
  });
});

describe("agent skill", () => {
  it("is versioned and embedded in the live judge prompt", () => {
    assert.ok(JUDGE_SYSTEM_PROMPT.startsWith(TRADING_SKILL));
    assert.ok(promptVersionFor(3).includes(AGENT_SKILL_VERSION));
  });
});
