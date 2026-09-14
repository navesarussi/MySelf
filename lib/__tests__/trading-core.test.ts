import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adx, aggregateBars, atr, ema, returnCorrelation, rsi, sma } from "../trading/indicators";
import { forceClose, newPendingPosition, openRiskR, ratchetStop, realizedR, stepPosition } from "../trading/position";
import { buildTradePlan } from "../trading/sizing";
import { RISK_ENVELOPE } from "../trading/config";
import { applyRiskScaleRequest, checkNewEntry, drawdownFromPeak, shouldTripKillSwitch, weekStartIso } from "../trading/risk-envelope";
import { computeStats, monteCarlo, wilsonInterval } from "../trading/metrics";
import { evaluateVetoes, nextTradingDays } from "../trading/veto";
import { bucketId } from "../trading/universe";
import type { Bar } from "../trading/types";

const bar = (t: number, o: number, h: number, l: number, c: number, v = 1000): Bar => ({ t, o, h, l, c, v });

describe("indicators", () => {
  it("sma and ema warm up then track", () => {
    const xs = [1, 2, 3, 4, 5, 6];
    assert.deepEqual(sma(xs, 3).slice(2), [2, 3, 4, 5]);
    const e = ema(xs, 3);
    assert.ok(Number.isNaN(e[1]));
    assert.equal(e[2], 2);
    assert.equal(e[3], 3);
  });

  it("rsi is 100 on monotonic rise and ~50 on alternation", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    assert.equal(rsi(up, 14).at(-1), 100);
    const alt = Array.from({ length: 60 }, (_, i) => (i % 2 ? 101 : 100));
    const v = rsi(alt, 14).at(-1)!;
    assert.ok(v > 40 && v < 60, `rsi ${v}`);
  });

  it("atr equals constant range; adx high in a steady trend", () => {
    const bars = Array.from({ length: 60 }, (_, i) => bar(i, 100 + i, 101 + i, 99 + i, 100.5 + i));
    const a = atr(bars, 14).at(-1)!;
    assert.ok(Math.abs(a - 2) < 1e-9);
    assert.ok(adx(bars, 14).at(-1)! > 50);
  });

  it("correlation of identical series is 1", () => {
    const a = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i) * 5 + i);
    assert.ok(Math.abs(returnCorrelation(a, a)! - 1) < 1e-9);
  });

  it("aggregates hourly into 4h buckets", () => {
    const h = 3_600_000;
    const bars = [0, 1, 2, 3, 4].map((k) => bar(k * h, 10 + k, 11 + k, 9 + k, 10.5 + k, 1));
    const agg = aggregateBars(bars, 4 * h);
    assert.equal(agg.length, 2);
    assert.deepEqual(agg[0], { t: 0, o: 10, h: 14, l: 9, c: 13.5, v: 4 });
  });
});

describe("sizing (stop first, then size)", () => {
  it("risks exactly the envelope % for crypto and keeps 2:1", () => {
    // Wide stop so the exposure cap can't bind: notional = risk / 5%.
    const plan = buildTradePlan({ entry: 100, stopDistance: 5, equity: 100_000, assetClass: "CRYPTO_ALT", riskScale: 0.5 })!;
    assert.equal(plan.risk_amount, RISK_ENVELOPE.MAX_RISK_PER_TRADE.CRYPTO_ALT * 100_000 * 0.5);
    assert.equal(plan.target, 110);
    assert.equal(plan.stop, 95);
  });

  it("shrinks size (not the stop) when exposure cap binds", () => {
    const plan = buildTradePlan({ entry: 100, stopDistance: 1, equity: 100_000, assetClass: "CRYPTO_MAJOR", riskScale: 1 })!;
    assert.equal(plan.stop, 99);
    assert.ok(plan.notional <= RISK_ENVELOPE.MAX_ASSET_EXPOSURE * 100_000 + 1e-6);
    assert.ok(plan.size_reduced_for_exposure);
  });

  it("clamps risk scale above 1 — nothing can raise risk", () => {
    const plan = buildTradePlan({ entry: 100, stopDistance: 10, equity: 100_000, assetClass: "STOCK", riskScale: 3 })!;
    assert.equal(plan.risk_amount, RISK_ENVELOPE.MAX_RISK_PER_TRADE.STOCK * 100_000);
  });

  it("an extra notional ceiling (buying power) only shrinks the position", () => {
    const plan = buildTradePlan({ entry: 100, stopDistance: 5, equity: 100_000, assetClass: "CRYPTO_ALT", riskScale: 1, maxNotional: 1_000 })!;
    assert.ok(plan.notional <= 1_000 + 1e-6);
    assert.equal(plan.stop, 95);
  });
});

describe("position state machine", () => {
  const mk = (usePartial = true) => newPendingPosition({ asset_class: "STOCK", entry: 100, stop: 95, size: 100, use_partial: usePartial });

  it("full loss is about -1R", () => {
    const p = mk();
    stepPosition(p, bar(1, 100, 101, 99.5, 100), { atr: 2 });
    stepPosition(p, bar(2, 99, 99, 94, 94.5), { atr: 2 });
    assert.equal(p.state, "CLOSED");
    assert.equal(p.exit_reason, "STOP");
    const r = realizedR(p);
    assert.ok(r < -1 && r > -1.05, `r=${r}`);
  });

  it("partial at 1R then breakeven ≈ +0.5R, stop moved to entry", () => {
    const p = mk();
    stepPosition(p, bar(1, 100, 100.5, 99.5, 100), { atr: 2 });
    const entry = p.entry_price!;
    const ev = stepPosition(p, bar(2, 101, entry + p.stop_distance + 0.1, 100.5, 104), { atr: 2 });
    assert.equal(p.state, "RISK_FREE");
    assert.ok(ev.some((e) => e.type === "PARTIAL_1R"));
    assert.equal(p.stop_price, entry);
    stepPosition(p, bar(3, 103, 103, entry - 1, entry - 0.5), { atr: 2 });
    assert.equal(p.exit_reason, "BREAKEVEN");
    const r = realizedR(p);
    assert.ok(r > 0.45 && r < 0.52, `r=${r}`);
  });

  it("partial then target ≈ +1.5R", () => {
    const p = mk();
    stepPosition(p, bar(1, 100, 100.5, 99.5, 100), { atr: 2 });
    stepPosition(p, bar(2, 101, 106, 100.5, 105), { atr: 2 });
    stepPosition(p, bar(3, 105, 112, 104, 111), { atr: 2 });
    assert.equal(p.exit_reason, "TARGET");
    const r = realizedR(p);
    assert.ok(r > 1.45 && r < 1.52, `r=${r}`);
  });

  it("gap through stop fills at the open and is flagged", () => {
    const p = mk();
    stepPosition(p, bar(1, 100, 100.5, 99.5, 100), { atr: 2 });
    stepPosition(p, bar(2, 90, 91, 89, 90), { atr: 2 });
    assert.ok(p.gapped_through_stop);
    assert.ok(realizedR(p) < -1.9);
  });

  it("trailing stop only ratchets up and never below entry", () => {
    const p = mk();
    p.exit_plan = "TRAIL_2ATR";
    stepPosition(p, bar(1, 100, 100.5, 99.5, 100), { atr: 2 });
    stepPosition(p, bar(2, 101, 106, 100.5, 105), { atr: 2 });
    stepPosition(p, bar(3, 105, 120, 104.5, 119), { atr: 2 });
    const t1 = p.trail_stop!;
    stepPosition(p, bar(4, 119, 119.5, 116, 116), { atr: 2 });
    assert.ok(p.trail_stop! >= t1);
    assert.equal(ratchetStop(110, 90), 110);
  });

  it("regime flip closes immediately; cancelled when limit not reached", () => {
    const p = mk();
    stepPosition(p, bar(1, 100, 100.5, 99.5, 100), { atr: 2 });
    stepPosition(p, bar(2, 100, 101, 99, 99.5), { atr: 2, regime_flip: true });
    assert.equal(p.exit_reason, "REGIME_FLIP");
    const q = mk();
    stepPosition(q, bar(1, 101, 103, 100.8, 102), { atr: 2 });
    assert.equal(q.state, "CANCELLED");
  });

  it("open risk is 0 once risk-free; forceClose closes", () => {
    const p = mk();
    assert.equal(openRiskR(p), 1);
    stepPosition(p, bar(1, 100, 100.5, 99.5, 100), { atr: 2 });
    stepPosition(p, bar(2, 101, 106, 100.5, 105), { atr: 2 });
    assert.equal(openRiskR(p), 0);
    forceClose(p, 104, "KILL_SWITCH", 3);
    assert.equal(p.state, "CLOSED");
  });
});

describe("structural management (strategy v2)", () => {
  const mk = () => {
    const p = newPendingPosition({ asset_class: "CRYPTO_ALT", entry: 100, stop: 95, size: 10 });
    p.exit_plan = "STRUCTURAL";
    p.target_price = 115; // 3R structural target
    p.breakeven_at_r = 1;
    p.partial_fraction = 0;
    p.trail_after_r = 2;
    p.trail_mult = 3;
    return p;
  };

  it("keeps the structural (>2R) target through the fill", () => {
    const p = mk();
    stepPosition(p, bar(1, 99.5, 100.2, 99, 100), { atr: 2 });
    assert.equal(p.state, "OPEN");
    assert.equal(p.target_price, 115);
  });

  it("moves stop to breakeven at 1R without selling, then trails after 2R", () => {
    const p = mk();
    stepPosition(p, bar(1, 99.5, 100.2, 99, 100), { atr: 2 });
    const entry = p.entry_price!;
    stepPosition(p, bar(2, 100.5, entry + p.stop_distance + 0.5, 100.2, 105), { atr: 2 });
    assert.equal(p.state, "RISK_FREE");
    assert.equal(p.stop_price, entry);
    assert.equal(p.size, 10);
    stepPosition(p, bar(3, 105, 112, 104.5, 111.5), { atr: 1 });
    assert.ok(p.stop_price > entry, "trail should lock profit after 2R");
  });

  it("TP extension raises the target and ratchets the stop; can never lower either", () => {
    const p = mk();
    stepPosition(p, bar(1, 99.5, 100.2, 99, 100), { atr: 2 });
    stepPosition(p, bar(2, 100.5, 106, 100.2, 105), { atr: 2 });
    const ev = stepPosition(p, bar(3, 110, 114, 109, 113), { atr: 2, raise_target_to: 125, raise_stop_to: 108 });
    assert.ok(ev.some((e) => e.type === "TARGET_EXTENDED"));
    assert.equal(p.target_price, 125);
    assert.equal(p.stop_price, 108);
    stepPosition(p, bar(4, 113, 114, 112, 113.5), { atr: 2, raise_target_to: 110, raise_stop_to: 90 });
    assert.equal(p.target_price, 125);
    assert.equal(p.stop_price, 108);
  });

  it("extended target is honoured: price passing the old target does not close the trade", () => {
    const p = mk();
    stepPosition(p, bar(1, 99.5, 100.2, 99, 100), { atr: 2 });
    stepPosition(p, bar(2, 100.5, 106, 100.2, 105), { atr: 2 });
    stepPosition(p, bar(3, 112, 116, 111.5, 115.5), { atr: 0.5, raise_target_to: 130, raise_stop_to: 110 });
    assert.notEqual(p.state, "CLOSED");
    stepPosition(p, bar(4, 116, 131, 115.5, 130), { atr: 0.5 });
    assert.equal(p.exit_reason, "TARGET");
    assert.ok(realizedR(p) > 5);
  });
});

describe("risk envelope", () => {
  const base = { equity: 100_000, peak_equity: 100_000, realized_r_today: 0, realized_r_week: 0, kill_switch_active: false, entries_paused: false, positions: [] };

  it("allows a clean entry", () => {
    assert.deepEqual(checkNewEntry(base, "SOL", []), []);
  });

  it("daily/weekly halts and kill switch", () => {
    const E = RISK_ENVELOPE;
    assert.ok(checkNewEntry({ ...base, realized_r_today: E.DAILY_LOSS_HALT_R }, "SOL", []).includes("DAILY_LOSS_HALT"));
    assert.ok(!checkNewEntry({ ...base, realized_r_today: E.DAILY_LOSS_HALT_R + 0.5 }, "SOL", []).includes("DAILY_LOSS_HALT"));
    assert.ok(checkNewEntry({ ...base, realized_r_week: E.WEEKLY_LOSS_HALT_R }, "SOL", []).includes("WEEKLY_LOSS_HALT"));
    assert.ok(shouldTripKillSwitch(100_000 * (1 - E.MASTER_KILL_SWITCH_DD), 100_000));
    assert.ok(!shouldTripKillSwitch(100_000 * (1 - E.MASTER_KILL_SWITCH_DD) + 1_000, 100_000));
    assert.ok(Math.abs(drawdownFromPeak(90, 100) - 0.1) < 1e-12);
  });

  it("caps concurrency, open risk and correlated positions (cross asset)", () => {
    const pos = (symbol: string, r = 1) => ({ symbol, notional: 1, open_risk_r: r });
    const E = RISK_ENVELOPE;
    const names = (n: number) => Array.from({ length: n }, (_, k) => `S${k}`);
    const full = { ...base, positions: names(E.MAX_CONCURRENT_POSITIONS).map((s) => pos(s, 0)) };
    assert.ok(checkNewEntry(full, "X", []).includes("MAX_CONCURRENT"));
    const n = E.MAX_CONCURRENT_POSITIONS - 1;
    const risky = { ...base, positions: names(n).map((s) => pos(s, E.MAX_TOTAL_OPEN_RISK_R / n)) };
    assert.ok(checkNewEntry(risky, "X", []).includes("MAX_OPEN_RISK"));
    const corrNames = names(E.MAX_CORRELATED_POSITIONS);
    const corr = { ...base, positions: corrNames.map((s) => pos(s, 0)) };
    assert.ok(checkNewEntry(corr, "ETH", corrNames).includes("MAX_CORRELATED"));
    assert.ok(!checkNewEntry(corr, "ETH", corrNames.slice(1)).includes("MAX_CORRELATED"));
  });

  it("risk scale: lowering is instant, raising is deferred", () => {
    assert.deepEqual(applyRiskScaleRequest({ current: 1, requested: 0.5, now: 0 }), { scale: 0.5, pending: null });
    const up = applyRiskScaleRequest({ current: 0.5, requested: 2, now: 0 });
    assert.equal(up.scale, 0.5);
    assert.equal(up.pending?.value, 1);
    assert.equal(weekStartIso(new Date("2026-09-13T10:00:00Z")), "2026-09-07");
  });
});

describe("metrics", () => {
  it("expectancy, PF, streaks and drawdown", () => {
    const rs = [-1, -1, 1.5, 0.5, -1, 1.5];
    const s = computeStats(rs.map((r, i) => ({ r, closed_at: i })));
    assert.equal(s.trades, 6);
    assert.equal(s.expectancy_r, 0.0833);
    assert.equal(s.max_loss_streak, 2);
    assert.equal(s.max_drawdown_r, 2);
    assert.equal(s.profit_factor, 1.1667);
  });

  it("wilson interval reflects small-sample uncertainty (30 trades @50%)", () => {
    const [lo, hi] = wilsonInterval(15, 30);
    assert.ok(lo < 0.34 && hi > 0.66);
  });

  it("monte carlo is reproducible", () => {
    const rs = [-1, 1.5, -1, 0.5, 1.5, -1];
    assert.deepEqual(monteCarlo(rs, 0.01, 200, 7), monteCarlo(rs, 0.01, 200, 7));
  });
});

describe("vetoes", () => {
  const now = new Date("2026-09-15T15:00:00Z"); // Tue 11:00 ET
  const common = { mode: "SWING" as const, now, calendar: [], earnings_symbols: new Set<string>() };

  it("fails closed on missing earnings feed, but not for ETFs", () => {
    assert.deepEqual(evaluateVetoes({ ...common, symbol: "NVDA", asset_class: "STOCK", earnings_symbols: null }), ["EARNINGS_DATA_UNAVAILABLE"]);
    assert.deepEqual(evaluateVetoes({ ...common, symbol: "SPY", asset_class: "STOCK", earnings_symbols: null }), []);
  });

  it("earnings window, macro day, funding and unlock", () => {
    assert.ok(evaluateVetoes({ ...common, symbol: "NVDA", asset_class: "STOCK", earnings_symbols: new Set(["NVDA"]) }).includes("EARNINGS_WINDOW"));
    assert.ok(
      evaluateVetoes({ ...common, symbol: "SOL", asset_class: "CRYPTO_ALT", calendar: [{ kind: "FOMC", date: "2026-09-15", symbol: null }], funding_rate: 0 }).includes("MACRO_EVENT_DAY")
    );
    assert.ok(evaluateVetoes({ ...common, symbol: "SOL", asset_class: "CRYPTO_ALT", funding_rate: 0.001 }).includes("EXTREME_FUNDING"));
    assert.ok(
      evaluateVetoes({ ...common, symbol: "SOL", asset_class: "CRYPTO_ALT", funding_rate: 0, calendar: [{ kind: "TOKEN_UNLOCK", date: "2026-09-20", symbol: "SOL" }] }).includes("TOKEN_UNLOCK")
    );
  });

  it("intraday session edges", () => {
    const open = new Date("2026-09-15T13:40:00Z"); // 09:40 ET
    assert.ok(evaluateVetoes({ ...common, mode: "INTRADAY", now: open, symbol: "SPY", asset_class: "STOCK" }).includes("SESSION_EDGE"));
    assert.deepEqual(nextTradingDays("2026-09-18", 2), ["2026-09-18", "2026-09-21"]);
  });

  it("bucket ids", () => {
    assert.equal(bucketId("CRYPTO_ALT", { median_atr_pct_90d: 0.06, avg_dollar_volume_30d: 1e9 }), "CRYPTO_ALT:HIGH:TIER_1");
  });
});
