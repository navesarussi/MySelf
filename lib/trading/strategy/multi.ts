import { EXECUTION_RULES } from "../config";
import { rsi, sma } from "../indicators";
import { computeStats, groupStats, type GroupStat, type PerformanceStats } from "../metrics";
import { applyExternalFill, forceClose, newPendingPosition, realizedR, stepPosition, type SimPosition } from "../position";
import type { AssetClass, Bar, ExitReason } from "../types";
import { buildDailyAsset, dailyRsRanks, donchianExitBreached, LIVE_DAILY_TREND_PARAMS, scanDailyTrendCandidates, type DailyAsset } from "./daily-trend";
import { closedIdx } from "./series";

/**
 * האסטרטגיית מסחר — deterministic multi-strategy book on daily bars.
 *
 * Several independent strategy families share one account: each is a pure `scan` (signals on a closed
 * daily bar) + `exit` (a strategy exit decided on a closed bar) + management handed to the position state
 * machine. The portfolio backtest and the live engine call the same functions, so research numbers are
 * what runs (docs/trading/multi-strategy.md).
 *
 * Why several families: trade count only rises legitimately by adding independent edges, not by loosening
 * one. Trend breakouts are rare and ride for weeks; mean reversion fires often and exits in days; the two
 * are negatively correlated in time (MR earns in chop, trend in runs).
 */

export const D1 = 86_400_000;

export type StrategyGroup = "STOCKS" | "ETF" | "CRYPTO";

export type StrategyId =
  | "TREND"
  | "MR_RSI2"
  | "MR_IBS"
  | "PULLBACK"
  | "CRYPTO_TREND"
  | "REVERSAL"
  | "MOM_PULLBACK"
  | "ETF_MR"
  | "MOMENTUM"
  | "ASSET_ROTATION"
  | "IBS_CLOSE"
  | "ETF_TREND";

/** A daily asset plus the extra series the families read — all from closed daily bars. */
export type MultiAsset = DailyAsset & {
  sma5: number[];
  sma10: number[];
  sma20: number[];
  sma50: number[];
  sma100: number[];
  rsi2: number[];
  /** Internal bar strength: where the close sits in the day's range (0 = low, 1 = high). */
  ibs: number[];
  /** 50-day average dollar volume — point-in-time liquidity, no look-ahead. */
  dv50: number[];
  /** 126-day (≈6-month) return — the momentum a cross-sectional rank is taken on. */
  ret126: number[];
  /** 12-1 month momentum: return from 252 to 21 bars ago (skips the last month's reversal). */
  mom12: number[];
  /** 5-day return. */
  ret5: number[];
  /** Blend of 1/3/6/12-month returns — the asset-rotation score. */
  mom_blend: number[];
};

export function buildMultiAsset(symbol: string, asset_class: AssetClass, group: StrategyGroup, bars: Bar[]): MultiAsset {
  const base = buildDailyAsset(symbol, asset_class, group, bars);
  const c = bars.map((b) => b.c);
  return {
    ...base,
    sma5: sma(c, 5),
    sma10: sma(c, 10),
    sma20: sma(c, 20),
    sma50: sma(c, 50),
    sma100: sma(c, 100),
    rsi2: rsi(c, 2),
    ibs: bars.map((b) => (b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5)),
    dv50: sma(bars.map((b) => b.c * b.v), 50),
    ret126: c.map((x, i) => (i >= 126 && c[i - 126] > 0 ? x / c[i - 126] - 1 : NaN)),
    mom12: c.map((_, i) => (i >= 252 && c[i - 252] > 0 ? c[i - 21] / c[i - 252] - 1 : NaN)),
    ret5: c.map((x, i) => (i >= 5 && c[i - 5] > 0 ? x / c[i - 5] - 1 : NaN)),
    mom_blend: c.map((x, i) => (i >= 252 ? (x / c[i - 21] + x / c[i - 63] + x / c[i - 126] + x / c[i - 252]) / 4 - 1 : NaN)),
  };
}

/** Rank (0 = weakest, 1 = strongest) of each asset's 6-month return among those with a bar at `t`. */
export function momentumRanks(assets: MultiAsset[], t: number): Map<string, number> {
  const list: { symbol: string; r: number }[] = [];
  for (const a of assets) {
    const i = a.idx.get(t);
    if (i === undefined || !Number.isFinite(a.ret126[i])) continue;
    list.push({ symbol: a.symbol, r: a.ret126[i] });
  }
  list.sort((x, y) => x.r - y.r);
  const out = new Map<string, number>();
  list.forEach((x, k) => out.set(x.symbol, list.length > 1 ? k / (list.length - 1) : 0.5));
  return out;
}

export type ScanContext = {
  /** Market regime references by group (SPY for stocks, BTC for crypto); ETFs trade without one. */
  references: Partial<Record<StrategyGroup, MultiAsset>>;
};

export type Signal = {
  strategy: StrategyId;
  a: MultiAsset;
  /** Signal bar (closed). */
  i: number;
  t: number;
  /** Reference price: the signal close. */
  entry: number;
  /** CLOSE: executed at the signal close; LIMIT_NEXT: a limit at `entry` that may fill on the next bar. */
  fill: "CLOSE" | "LIMIT_NEXT";
  stop: number;
  target: number | null;
  /** Priority when capacity is short (higher first). */
  score: number;
};

export type Management = {
  breakeven_at_r: number;
  trail_after_r: number | null;
  trail_mult: number;
  /** Close at the end of this many bars in the trade (TIME_STOP); null = no time limit. */
  max_hold_bars: number | null;
};

export type StrategyDef = {
  id: StrategyId;
  groups: StrategyGroup[];
  manage: Management;
  scan(assets: MultiAsset[], t: number, ctx: ScanContext): Signal[];
  /** Exit decided on closed bar `i` of an open position, executed at that close. */
  exit?(a: MultiAsset, i: number, pos: SimPosition): ExitReason | null;
  /**
   * Cross-sectional state for bar `t` (ranks), called with the sleeve's whole universe before positions are
   * managed or scanned on that bar — exits of rank-based families depend on the rest of the universe.
   */
  prepare?(assets: MultiAsset[], t: number): void;
};

const fin = (x: number | undefined) => typeof x === "number" && Number.isFinite(x);

/** Is the group's regime reference above its 200-day average on the bar that closed by `t`? */
export function regimeUp(ctx: ScanContext, group: StrategyGroup, t: number, smaKey: "sma200" | "sma100" = "sma200"): boolean {
  const ref = ctx.references[group];
  if (!ref) return true;
  const ri = closedIdx(ref.d1, t + D1);
  if (ri < 0) return false;
  const level = ref[smaKey][ri];
  return fin(level) && ref.d1.bars[ri].c > level;
}

function barAt(a: MultiAsset, t: number): number | null {
  const i = a.idx.get(t);
  return i === undefined ? null : i;
}

// ── Families ────────────────────────────────────────────────────────────────

export type TrendParams = {
  /** Point-in-time liquidity floor (50-day average dollar volume); 0 = off. */
  min_dv: number;
  /** Minimum volatility-adjusted relative-strength rank within the group (dailyRsRanks, 0–1). */
  rs_min: number;
};
export const TREND_PARAMS: TrendParams = { min_dv: 0, rs_min: LIVE_DAILY_TREND_PARAMS.rs_min };

/** Trend breakout — the validated daily-trend strategy (100-day high, 3×ATR stop and chandelier, 20-day-low exit). */
export function trendBreakout(p: TrendParams = TREND_PARAMS): StrategyDef {
  const params = { ...LIVE_DAILY_TREND_PARAMS, rs_min: p.rs_min };
  return {
    id: "TREND",
    // 2016-26 by group (multi-research): stocks +0.10/+0.01/+0.17R train/valid/holdout; ETFs flat since 2022;
    // crypto is better served by CRYPTO_TREND (+0.34R vs +0.01R in validation).
    groups: ["STOCKS"],
    manage: { breakeven_at_r: 100, trail_after_r: LIVE_DAILY_TREND_PARAMS.trail_after_r, trail_mult: LIVE_DAILY_TREND_PARAMS.trail_atr, max_hold_bars: null },
    scan(assets, t, ctx) {
      const refs = { STOCKS: ctx.references.STOCKS, CRYPTO: ctx.references.CRYPTO, ETF: undefined };
      const pool = p.min_dv ? assets.filter((a) => {
        const i = a.idx.get(t);
        return i !== undefined && a.dv50[i] >= p.min_dv;
      }) : assets;
      return scanDailyTrendCandidates(pool, t, refs, params, dailyRsRanks(pool, t)).map((c) => ({
        strategy: "TREND" as const,
        a: c.a as MultiAsset,
        i: c.i,
        t,
        entry: c.entry,
        fill: "LIMIT_NEXT" as const,
        stop: c.stop,
        target: null,
        score: c.rs ?? 0.5,
      }));
    },
    exit(a, i) {
      return donchianExitBreached(a.d1, i, LIVE_DAILY_TREND_PARAMS.exit_days) ? "TRAIL" : null;
    },
  };
}
export const TREND: StrategyDef = trendBreakout();

export type MrRsi2Params = { rsi_max: number; exit_sma: 5 | 10; stop_atr: number; max_hold: number; min_price: number };
export const MR_RSI2_PARAMS: MrRsi2Params = { rsi_max: 10, exit_sma: 5, stop_atr: 2.5, max_hold: 10, min_price: 5 };

/**
 * Short-term mean reversion (Connors RSI(2)): in a long-term uptrend (close > SMA200, market regime up),
 * buy a 2-day RSI washout at the close; sell the first close back above the 5-day average.
 */
export function mrRsi2(p: MrRsi2Params = MR_RSI2_PARAMS): StrategyDef {
  return {
    id: "MR_RSI2",
    groups: ["STOCKS", "ETF"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: p.max_hold },
    scan(assets, t, ctx) {
      const out: Signal[] = [];
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < 210) continue;
        const b = a.d1.bars[i];
        if (!(b.c >= p.min_price) || !(b.c > a.sma200[i]) || !(a.rsi2[i] < p.rsi_max)) continue;
        if (a.group === "STOCKS" && !regimeUp(ctx, "STOCKS", t)) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        out.push({ strategy: "MR_RSI2", a, i, t, entry: b.c, fill: "CLOSE", stop: b.c - p.stop_atr * atrv, target: null, score: p.rsi_max - a.rsi2[i] });
      }
      return out;
    },
    exit(a, i) {
      const level = p.exit_sma === 5 ? a.sma5[i] : a.sma10[i];
      return a.d1.bars[i].c > level ? "SIGNAL" : null;
    },
  };
}

export type MrIbsParams = { ibs_max: number; exit_ibs: number; stop_atr: number; max_hold: number; trend: boolean };
export const MR_IBS_PARAMS: MrIbsParams = { ibs_max: 0.15, exit_ibs: 0.75, stop_atr: 2.5, max_hold: 5, trend: true };

/** Internal-bar-strength reversion on ETFs: a close at the bottom of the day's range tends to be bought back. */
export function mrIbs(p: MrIbsParams = MR_IBS_PARAMS): StrategyDef {
  return {
    id: "MR_IBS",
    groups: ["ETF"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: p.max_hold },
    scan(assets, t) {
      const out: Signal[] = [];
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < 210) continue;
        const b = a.d1.bars[i];
        if (!(a.ibs[i] < p.ibs_max) || (p.trend && !(b.c > a.sma200[i]))) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        out.push({ strategy: "MR_IBS", a, i, t, entry: b.c, fill: "CLOSE", stop: b.c - p.stop_atr * atrv, target: null, score: p.ibs_max - a.ibs[i] });
      }
      return out;
    },
    exit(a, i) {
      const b = a.d1.bars[i];
      return a.ibs[i] > p.exit_ibs || (i > 0 && b.c > a.d1.bars[i - 1].h) ? "SIGNAL" : null;
    },
  };
}

export type PullbackParams = {
  down_days: number;
  stop_atr: number;
  exit_high_days: number;
  max_hold: number;
  trail_after_r: number | null;
  trail_mult: number;
  /** Point-in-time liquidity floor (50-day average dollar volume). */
  min_dv?: number;
  /** Minimum 6-month momentum rank among the scanned stocks (0–1). */
  min_rs?: number;
};
/** Chosen on 2016-21 (all 108 grid configs were positive, median Sharpe 0.55), confirmed on 2022-24H1 (+0.05R). */
export const PULLBACK_PARAMS: PullbackParams = { down_days: 3, stop_atr: 1.5, exit_high_days: 10, max_hold: 20, trail_after_r: null, trail_mult: 2.5 };

/**
 * Buy the dip inside a confirmed trend (SMA50 > SMA200, close > SMA200, market regime up) after N lower
 * closes; sell the first close above the recent high. Stocks only — on ETFs it lost in 2022-24.
 */
export function pullback(p: PullbackParams = PULLBACK_PARAMS): StrategyDef {
  return {
    id: "PULLBACK",
    groups: ["STOCKS"],
    manage: { breakeven_at_r: 100, trail_after_r: p.trail_after_r, trail_mult: p.trail_mult, max_hold_bars: p.max_hold },
    scan(assets, t, ctx) {
      const out: Signal[] = [];
      const ranks = p.min_rs ? momentumRanks(assets, t) : null;
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < 210) continue;
        const bars = a.d1.bars;
        const b = bars[i];
        if (!(b.c > a.sma200[i]) || !(a.sma50[i] > a.sma200[i])) continue;
        if (p.min_dv && !(a.dv50[i] >= p.min_dv)) continue;
        if (ranks && !((ranks.get(a.symbol) ?? 0) >= (p.min_rs ?? 0))) continue;
        let down = true;
        for (let k = 0; k < p.down_days; k++) if (!(bars[i - k].c < bars[i - k - 1].c)) down = false;
        if (!down) continue;
        if (a.group === "STOCKS" && !regimeUp(ctx, "STOCKS", t)) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        out.push({ strategy: "PULLBACK", a, i, t, entry: b.c, fill: "CLOSE", stop: b.c - p.stop_atr * atrv, target: null, score: (a.sma50[i] - a.sma200[i]) / atrv });
      }
      return out;
    },
    exit(a, i) {
      const bars = a.d1.bars;
      let hi = -Infinity;
      for (let j = i - p.exit_high_days; j < i; j++) if (j >= 0) hi = Math.max(hi, bars[j].h);
      return bars[i].c > hi ? "SIGNAL" : null;
    },
  };
}

export type CryptoTrendParams = { breakout_days: number; exit_days: number; stop_atr: number; trail_mult: number; regime_sma: "sma100" | "sma200" };
/** Chosen on 2018-21 (all 216 grid configs positive, median Sharpe 1.28), confirmed on 2022-24H1 (+0.34R, Sharpe 0.66). */
export const CRYPTO_TREND_PARAMS: CryptoTrendParams = { breakout_days: 20, exit_days: 10, stop_atr: 2.5, trail_mult: 4, regime_sma: "sma100" };

/** Faster crypto trend: 20-day breakout while BTC is above its 100-day average; 10-day-low exit and a 4×ATR chandelier. */
export function cryptoTrend(p: CryptoTrendParams = CRYPTO_TREND_PARAMS): StrategyDef {
  return {
    id: "CRYPTO_TREND",
    groups: ["CRYPTO"],
    manage: { breakeven_at_r: 100, trail_after_r: 0, trail_mult: p.trail_mult, max_hold_bars: null },
    scan(assets, t, ctx) {
      if (!regimeUp(ctx, "CRYPTO", t, p.regime_sma)) return [];
      const out: Signal[] = [];
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < Math.max(110, p.breakout_days + 1)) continue;
        const bars = a.d1.bars;
        let hi = -Infinity;
        for (let j = i - p.breakout_days; j < i; j++) hi = Math.max(hi, bars[j].h);
        const b = bars[i];
        if (!(b.c > hi) || !(b.c > a.sma100[i])) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        out.push({ strategy: "CRYPTO_TREND", a, i, t, entry: b.c, fill: "CLOSE", stop: b.c - p.stop_atr * atrv, target: null, score: (b.c - hi) / atrv });
      }
      return out;
    },
    exit(a, i) {
      return donchianExitBreached(a.d1, i, p.exit_days) ? "TRAIL" : null;
    },
  };
}

// ── Cross-sectional helpers ─────────────────────────────────────────────────

/** Is closed bar `i` the first session of a new calendar month (the monthly rebalance bar)? */
export function firstBarOfMonth(a: MultiAsset, i: number): boolean {
  const bars = a.d1.bars;
  return i > 0 && new Date(bars[i].t).getUTCMonth() !== new Date(bars[i - 1].t).getUTCMonth();
}

/** Point-in-time liquid stock: price and 50-day average dollar volume on the bar. */
export function isLiquid(a: MultiAsset, i: number, minPrice = 10, minDv = 20e6): boolean {
  return a.d1.bars[i].c >= minPrice && a.dv50[i] >= minDv;
}

/**
 * Ordinal ranks (0 = best) of `value` among the eligible assets with a bar at `t`, memoised per t.
 * Also returns percentile ranks (1 = best) for filters.
 */
export function crossRanker(value: (a: MultiAsset, i: number) => number | null) {
  const cache = new Map<number, { ord: Map<string, number>; pct: Map<string, number>; n: number }>();
  return {
    prepare(assets: MultiAsset[], t: number) {
      if (cache.has(t)) return;
      const list: { s: string; v: number }[] = [];
      for (const a of assets) {
        const i = a.idx.get(t);
        if (i === undefined) continue;
        const v = value(a, i);
        if (v !== null && Number.isFinite(v)) list.push({ s: a.symbol, v });
      }
      list.sort((x, y) => y.v - x.v);
      const n = list.length;
      cache.set(t, { ord: new Map(list.map((x, k) => [x.s, k])), pct: new Map(list.map((x, k) => [x.s, n > 1 ? 1 - k / (n - 1) : 1])), n });
      // bounded memory in long backtests: ranks are only read for the current bar
      if (cache.size > 8) cache.delete(cache.keys().next().value as number);
    },
    ord: (symbol: string, t: number) => cache.get(t)?.ord.get(symbol) ?? null,
    pct: (symbol: string, t: number) => cache.get(t)?.pct.get(symbol) ?? null,
  };
}

const liquidMom12 = (a: MultiAsset, i: number) => (isLiquid(a, i) && Number.isFinite(a.mom12[i]) ? a.mom12[i] : null);

// ── Swing: dips in momentum leaders ─────────────────────────────────────────

export type ReversalParams = { drop: number; min_rank: number; stop_atr: number; max_hold: number };
/**
 * Chosen 2016-21, confirmed 2022-24H1 and 2024H2+ (excess over the equal-weight universe, t-stats 5.1 / 2.3 / 5.1
 * — docs/trading/multi-strategy.md). A wide stop: tight stops cut mean-reversion trades before they revert.
 */
export const REVERSAL_PARAMS: ReversalParams = { drop: 0.1, min_rank: 0.7, stop_atr: 4, max_hold: 10 };

/**
 * Short-term reversal in leaders: a liquid stock in a long-term uptrend, in the top 30% by 12-1 momentum,
 * that fell ≥ 10% in 5 sessions; bought at the next open, sold at the first close back above its 5-day average.
 */
export function reversal(p: ReversalParams = REVERSAL_PARAMS): StrategyDef {
  const ranks = crossRanker(liquidMom12);
  return {
    id: "REVERSAL",
    groups: ["STOCKS"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: p.max_hold },
    prepare: (assets, t) => ranks.prepare(assets, t),
    scan(assets, t, ctx) {
      if (!regimeUp(ctx, "STOCKS", t)) return [];
      ranks.prepare(assets, t);
      const out: Signal[] = [];
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < 253 || !isLiquid(a, i)) continue;
        const b = a.d1.bars[i];
        if (!(a.ret5[i] < -p.drop) || !(b.c > a.sma200[i])) continue;
        const pct = ranks.pct(a.symbol, t);
        if (pct === null || pct < p.min_rank) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        out.push({ strategy: "REVERSAL", a, i, t, entry: b.c, fill: "CLOSE", stop: b.c - p.stop_atr * atrv, target: null, score: Math.min(1, -a.ret5[i]) });
      }
      return out;
    },
    exit: (a, i) => (a.d1.bars[i].c > a.sma5[i] ? "SIGNAL" : null),
  };
}

export type MomPullbackParams = { down_days: number; min_rank: number; stop_atr: number; max_hold: number };
/** 2016-21 / 2022-24H1 / 2024H2+: excess +0.28% / +0.19% / +0.54% a trade over the equal-weight universe. */
export const MOM_PULLBACK_PARAMS: MomPullbackParams = { down_days: 3, min_rank: 0.9, stop_atr: 4, max_hold: 10 };

/** Three lower closes in a top-decile momentum stock above its 200-day average; out on a close above the 5-day average. */
export function momPullback(p: MomPullbackParams = MOM_PULLBACK_PARAMS): StrategyDef {
  const ranks = crossRanker(liquidMom12);
  return {
    id: "MOM_PULLBACK",
    groups: ["STOCKS"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: p.max_hold },
    prepare: (assets, t) => ranks.prepare(assets, t),
    scan(assets, t, ctx) {
      if (!regimeUp(ctx, "STOCKS", t)) return [];
      ranks.prepare(assets, t);
      const out: Signal[] = [];
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < 253 || !isLiquid(a, i)) continue;
        const bars = a.d1.bars;
        if (!(bars[i].c > a.sma200[i])) continue;
        let down = true;
        for (let k = 0; k < p.down_days; k++) if (!(bars[i - k].c < bars[i - k - 1].c)) down = false;
        if (!down) continue;
        const pct = ranks.pct(a.symbol, t);
        if (pct === null || pct < p.min_rank) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        out.push({ strategy: "MOM_PULLBACK", a, i, t, entry: bars[i].c, fill: "CLOSE", stop: bars[i].c - p.stop_atr * atrv, target: null, score: pct });
      }
      return out;
    },
    exit: (a, i) => (a.d1.bars[i].c > a.sma5[i] ? "SIGNAL" : null),
  };
}

/** Broad equity index, sector and country ETFs — where short-term mean reversion held from 2007 to 2026. */
export { EQUITY_ETFS } from "./etf-lists";
import { EQUITY_ETFS, ROTATION_ETFS } from "./etf-lists";

export type EtfMrParams = { rsi_max: number; stop_atr: number; max_hold: number };
/** 2007-15 / 2016-21 / 2022-24H1 / 2024H2+: +0.31% / +0.33% / +0.01% / +0.47% a trade, ~350 trades a year. */
export const ETF_MR_PARAMS: EtfMrParams = { rsi_max: 10, stop_atr: 3, max_hold: 10 };

/** RSI(2) washout in an equity ETF above its 200-day average; out on a close above the 5-day average. */
export function etfMr(p: EtfMrParams = ETF_MR_PARAMS): StrategyDef {
  return {
    id: "ETF_MR",
    groups: ["ETF"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: p.max_hold },
    scan(assets, t) {
      const out: Signal[] = [];
      for (const a of assets) {
        if (!EQUITY_ETFS.has(a.symbol)) continue;
        const i = barAt(a, t);
        if (i === null || i < 210) continue;
        const b = a.d1.bars[i];
        if (!(b.c > a.sma200[i]) || !(a.rsi2[i] < p.rsi_max)) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        out.push({ strategy: "ETF_MR", a, i, t, entry: b.c, fill: "CLOSE", stop: b.c - p.stop_atr * atrv, target: null, score: (p.rsi_max - a.rsi2[i]) / p.rsi_max });
      }
      return out;
    },
    exit: (a, i) => (a.d1.bars[i].c > a.sma5[i] ? "SIGNAL" : null),
  };
}

// ── Next-day: closing-range reversal (market-on-close) ──────────────────────

export type IbsCloseParams = { ibs_max: number; max_positions: number; notional_pct: number; stop_atr: number; target_atr: number; max_hold: number };
/**
 * Equity ETFs closing at the bottom of the day's range (IBS < 0.1) mean-revert over the next days. Traded as a
 * short bracket: bought at the close (market-on-close), then a broker-side OCO — take-profit 1.5×ATR, stop-loss
 * 1×ATR — and out at the close of the 3rd session if neither was hit. 2007-15 / 2016-21 / 2022-24H1 / 2024H2+:
 * +0.096 / +0.106 / +0.099 / +0.120R a trade (t 8.9 / 7.9 / 5.1 / 5.5; ~25% take-profits, ~37% stops); every
 * TP/SL/hold combination on the grid (0.75–2 ATR, 2–5 days) was positive in every period. The 15:50 ET IBS keeps
 * the edge, and IEX live bars pick the same signals as SIP 87% of the time.
 */
export const IBS_CLOSE_PARAMS: IbsCloseParams = { ibs_max: 0.1, max_positions: 6, notional_pct: 0.12, stop_atr: 1, target_atr: 1.5, max_hold: 3 };

export function ibsOf(b: Bar): number {
  return b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5;
}

/** Buy the close of an equity ETF whose close sits in the bottom tenth of its range; exit at the bracket or the 3rd close. */
export function ibsClose(p: IbsCloseParams = IBS_CLOSE_PARAMS): StrategyDef {
  return {
    id: "IBS_CLOSE",
    groups: ["ETF"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: p.max_hold },
    scan(assets, t) {
      const out: Signal[] = [];
      for (const a of assets) {
        if (!EQUITY_ETFS.has(a.symbol)) continue;
        const i = barAt(a, t);
        if (i === null || i < 20) continue;
        const b = a.d1.bars[i];
        const ibs = ibsOf(b);
        const atrv = a.d1.atr[i - 1];
        if (!(ibs < p.ibs_max) || !(b.h > b.l) || !fin(atrv)) continue;
        out.push({ strategy: "IBS_CLOSE", a, i, t, entry: b.c, fill: "CLOSE", stop: b.c - p.stop_atr * atrv, target: b.c + p.target_atr * atrv, score: 1 - ibs / p.ibs_max });
      }
      return out.sort((x, y) => y.score - x.score);
    },
  };
}

// ── Long horizon: monthly rotations ─────────────────────────────────────────

export type MomentumParams = { top: number; keep: number; stop_atr: number };
export const MOMENTUM_PARAMS: MomentumParams = { top: 20, keep: 50, stop_atr: 5 };

/**
 * Cross-sectional momentum: on the first session of each month buy the top-N liquid stocks by 12-1 momentum;
 * hold while they stay in the top `keep` (checked monthly). A wide ATR stop is the catastrophe exit.
 */
export function momentum(p: MomentumParams = MOMENTUM_PARAMS): StrategyDef {
  const ranks = crossRanker(liquidMom12);
  return {
    id: "MOMENTUM",
    groups: ["STOCKS"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: null },
    prepare: (assets, t) => ranks.prepare(assets, t),
    scan(assets, t) {
      ranks.prepare(assets, t);
      const out: Signal[] = [];
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < 253 || !firstBarOfMonth(a, i)) continue;
        const ord = ranks.ord(a.symbol, t);
        if (ord === null || ord >= p.top) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        const c = a.d1.bars[i].c;
        out.push({ strategy: "MOMENTUM", a, i, t, entry: c, fill: "CLOSE", stop: c - p.stop_atr * atrv, target: null, score: 1 - ord / p.top });
      }
      return out;
    },
    exit(a, i) {
      if (!firstBarOfMonth(a, i)) return null;
      const ord = ranks.ord(a.symbol, a.d1.bars[i].t);
      return ord === null || ord >= p.keep ? "SIGNAL" : null;
    },
  };
}

/** Cross-asset ETFs: US/international equity, real estate, Treasuries, credit, TIPS, gold, commodities. */
export { ROTATION_ETFS } from "./etf-lists";

export type AssetRotationParams = { top: number; keep: number; stop_atr: number };
/** 2007-15 / 2016-21 / 2022-24H1 / 2024H2+ (top 5): Sharpe 0.69 / 1.15 / 0.00 / 1.44, max drawdown ≤ 16%. */
export const ASSET_ROTATION_PARAMS: AssetRotationParams = { top: 5, keep: 7, stop_atr: 5 };

/** Monthly asset-class rotation: the top-N by blended 1/3/6/12-month momentum that are also above their 200-day average. */
export function assetRotation(p: AssetRotationParams = ASSET_ROTATION_PARAMS): StrategyDef {
  const ranks = crossRanker((a, i) => (ROTATION_ETFS.has(a.symbol) && a.d1.bars[i].c > a.sma200[i] && a.mom_blend[i] > 0 ? a.mom_blend[i] : null));
  return {
    id: "ASSET_ROTATION",
    groups: ["ETF"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: null },
    prepare: (assets, t) => ranks.prepare(assets, t),
    scan(assets, t) {
      ranks.prepare(assets, t);
      const out: Signal[] = [];
      for (const a of assets) {
        const i = barAt(a, t);
        if (i === null || i < 253 || !firstBarOfMonth(a, i)) continue;
        const ord = ranks.ord(a.symbol, t);
        if (ord === null || ord >= p.top) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        const c = a.d1.bars[i].c;
        out.push({ strategy: "ASSET_ROTATION", a, i, t, entry: c, fill: "CLOSE", stop: c - p.stop_atr * atrv, target: null, score: 1 - ord / p.top });
      }
      return out;
    },
    exit(a, i) {
      if (!firstBarOfMonth(a, i)) return null;
      const ord = ranks.ord(a.symbol, a.d1.bars[i].t);
      return ord === null || ord >= p.keep ? "SIGNAL" : null;
    },
  };
}

// ── Portfolio backtest ──────────────────────────────────────────────────────

/**
 * Time-series trend on non-equity ETFs (phase 2 research, docs/superpowers/specs/2026-09-30-trading-phase2-edge-design.md §D):
 * every bond / commodity / currency ETF in an uptrend (above SMA200, blended momentum > 0), not just the top few —
 * the book is all long equities plus crypto, and 2022-24 (rates up, dollar up, commodities up) was its weakest period.
 * Monthly decisions like ASSET_ROTATION; 5×ATR catastrophe stop.
 */
export const NON_EQUITY_ETFS: ReadonlySet<string> = new Set("TLT,IEF,SHY,AGG,LQD,HYG,EMB,TIP,GLD,SLV,DBC,DBA,USO,UNG,UUP,FXE,FXY".split(","));
export type EtfTrendParams = { stop_atr: number; universe: ReadonlySet<string> };
export const ETF_TREND_PARAMS: EtfTrendParams = { stop_atr: 5, universe: NON_EQUITY_ETFS };

export function etfTrend(p: EtfTrendParams = ETF_TREND_PARAMS): StrategyDef {
  const trending = (a: MultiAsset, i: number) => a.d1.bars[i].c > a.sma200[i] && a.mom_blend[i] > 0;
  return {
    id: "ETF_TREND",
    groups: ["ETF"],
    manage: { breakeven_at_r: 100, trail_after_r: null, trail_mult: 0, max_hold_bars: null },
    scan(assets, t) {
      const out: Signal[] = [];
      for (const a of assets) {
        if (!p.universe.has(a.symbol)) continue;
        const i = barAt(a, t);
        if (i === null || i < 253 || !firstBarOfMonth(a, i) || !trending(a, i)) continue;
        const atrv = a.d1.atr[i];
        if (!fin(atrv)) continue;
        const c = a.d1.bars[i].c;
        out.push({ strategy: "ETF_TREND", a, i, t, entry: c, fill: "CLOSE", stop: c - p.stop_atr * atrv, target: null, score: 0.5 + Math.min(0.4, a.mom_blend[i]) });
      }
      return out;
    },
    exit(a, i) {
      if (!firstBarOfMonth(a, i)) return null;
      return trending(a, i) ? null : "SIGNAL";
    },
  };
}

export type Sleeve = { def: StrategyDef; risk_pct: number; max_positions: number };

export type BookEnvelope = {
  max_positions: number;
  /** Sum of open initial risk (fraction of equity) across positions whose stop is still below entry. */
  max_open_risk: number;
  /** Notional cap per position (fraction of equity). */
  max_notional: number;
  /** Gross notional cap across the book (fraction of equity; stocks have 2× margin at Alpaca, crypto none). */
  max_gross: number;
};

/**
 * No drawdown brake: tested on 2016-26 it locked the book at −20% (no new entries → no recovery) and cut the
 * 10-year CAGR from 21% to 5%. Drawdown is controlled by the per-trade risk of each sleeve instead.
 */
export const DEFAULT_BOOK_ENVELOPE: BookEnvelope = { max_positions: 12, max_open_risk: 0.06, max_notional: 0.2, max_gross: 1.5 };

export type BookTrade = {
  strategy: StrategyId;
  symbol: string;
  group: string;
  asset_class: AssetClass;
  opened_at: number;
  closed_at: number;
  r: number;
  pnl: number;
  exit_reason: string;
  bars_held: number;
  mfe_r: number;
};

export type BookResult = {
  stats: PerformanceStats;
  trades: BookTrade[];
  equity: { t: number; equity: number }[];
  cagr: number;
  sharpe: number | null;
  max_dd: number;
  by_strategy: GroupStat[];
  blocked: Record<string, number>;
  /** Positions still open (or queued for the next open) at `end`, before the final mark-to-market close. */
  open_at_end: { symbol: string; strategy: StrategyId; size: number; entry: number; stop: number; opened_at: number | null; pending: boolean }[];
};

type Live = {
  pos: SimPosition;
  a: MultiAsset;
  sleeve: Sleeve;
  risk_pct: number;
  entered_at_close_of: number | null;
  /** NEXT_OPEN execution: the entry is a market-on-open order for the next bar. */
  enter_next_open?: boolean;
  /** NEXT_OPEN execution: a strategy/time exit decided at a close, sold at the next open. */
  exit_next_open?: ExitReason | null;
};

/**
 * How signals at a close are executed for stocks. CLOSE = at that close (what a 15:50 ET order approximates);
 * NEXT_OPEN = market-on-open the next session (what an order sent after the close gets). Crypto trades
 * around the clock, so its "close" order is sent right after the daily bar closes either way.
 */
export type StockExecution = "CLOSE" | "NEXT_OPEN";

/**
 * Open a position for `sig`: filled at the signal close (with the assumed slippage) or resting as a limit
 * for the next bar. Pure — also what the live engine uses to seed a broker-backed trade's state.
 */
export function positionForSignal(sig: Signal, size: number, m: Management = defFor(sig.strategy).manage): SimPosition {
  const pos = newPendingPosition({ asset_class: sig.a.asset_class, entry: sig.entry, stop: sig.stop, size });
  pos.exit_plan = "STRUCTURAL";
  pos.target_price = sig.target ?? sig.entry + 1000 * (sig.entry - sig.stop);
  pos.initial_target_price = pos.target_price;
  pos.breakeven_at_r = m.breakeven_at_r;
  pos.partial_fraction = 0;
  pos.trail_after_r = m.trail_after_r;
  pos.trail_mult = m.trail_mult;
  return pos;
}

const REGISTRY = new Map<StrategyId, StrategyDef>();
/** Every family the book knows (defaults); the backtest may pass tuned copies through its sleeves. */
export function registerStrategies(defs: StrategyDef[]) {
  for (const d of defs) REGISTRY.set(d.id, d);
}
registerStrategies([TREND, mrRsi2(), mrIbs(), pullback(), cryptoTrend(), reversal(), momPullback(), etfMr(), momentum(), assetRotation(), ibsClose(), etfTrend()]);
export function defFor(id: StrategyId): StrategyDef {
  const d = REGISTRY.get(id);
  if (!d) throw new Error(`unknown strategy ${id}`);
  return d;
}

/** Strategy exit or time stop for an open position on closed bar `i` (null = hold). */
export function exitDecision(def: StrategyDef, a: MultiAsset, i: number, pos: SimPosition): ExitReason | null {
  if (pos.state !== "OPEN" && pos.state !== "RISK_FREE") return null;
  const signal = def.exit?.(a, i, pos) ?? null;
  if (signal) return signal;
  if (def.manage.max_hold_bars !== null && pos.bars_held + 1 >= def.manage.max_hold_bars) return "TIME_STOP";
  return null;
}

export function runBook(input: {
  assets: MultiAsset[];
  references: ScanContext["references"];
  sleeves: Sleeve[];
  envelope?: BookEnvelope;
  start: number;
  end: number;
  starting_equity: number;
  stock_execution?: StockExecution;
  /**
   * Risk allocation (lib/trading/strategy/allocation.ts): a multiplier on the sleeve's risk_pct for a new entry,
   * given the book's daily returns and each sleeve's daily P&L ÷ book equity so far (oldest first).
   */
  allocation?: (sleeve: StrategyId, state: { t: number; book: number[]; sleeves: Map<string, number[]> }) => number;
}): BookResult {
  const env = input.envelope ?? DEFAULT_BOOK_ENVELOPE;
  const ctx: ScanContext = { references: input.references };
  const times = [...new Set(input.assets.flatMap((a) => a.d1.bars.map((b) => b.t)))].filter((t) => t >= input.start && t <= input.end).sort((a, b) => a - b);
  const bySleeveAssets = input.sleeves.map((s) => input.assets.filter((a) => s.def.groups.includes(a.group as StrategyGroup)));
  let cash = input.starting_equity;
  let peak = cash;
  let maxDd = 0;
  const curve: { t: number; equity: number }[] = [];
  const trades: BookTrade[] = [];
  const blocked: Record<string, number> = {};
  const live: Live[] = [];
  const block = (k: string) => (blocked[k] = (blocked[k] ?? 0) + 1);
  // Per-sleeve value (realized + open mark) for the allocation's return series.
  const sleeveRealized = new Map<string, number>();
  const sleevePrev = new Map<string, number>();
  const sleeveReturns = new Map<string, number[]>(input.sleeves.map((s) => [s.def.id, []]));
  const bookReturns: number[] = [];

  const settle = (l: Live) => {
    if (l.pos.state !== "CLOSED") return;
    cash += l.pos.cash_flow;
    sleeveRealized.set(l.sleeve.def.id, (sleeveRealized.get(l.sleeve.def.id) ?? 0) + l.pos.cash_flow);
    trades.push({
      strategy: l.sleeve.def.id,
      symbol: l.a.symbol,
      group: l.a.group,
      asset_class: l.a.asset_class,
      opened_at: l.pos.opened_at ?? l.pos.closed_at ?? 0,
      closed_at: l.pos.closed_at ?? 0,
      r: realizedR(l.pos),
      pnl: l.pos.cash_flow,
      exit_reason: l.pos.exit_reason ?? "?",
      bars_held: l.pos.bars_held,
      mfe_r: l.pos.mfe_r,
    });
  };
  const markPrice = (l: Live, t: number) => {
    const i = closedIdx(l.a.d1, t + D1);
    return i >= 0 ? l.a.d1.bars[i].c : (l.pos.entry_price ?? l.pos.entry_limit);
  };

  for (const t of times) {
    // 0) cross-sectional state (ranks) for rank-based exits and scans
    input.sleeves.forEach((s, k) => s.def.prepare?.(bySleeveAssets[k], t));
    // 1) manage every position on today's closed bar: stops/trail intrabar, strategy exits at the close.
    for (let k = live.length - 1; k >= 0; k--) {
      const l = live[k];
      const i = l.a.idx.get(t);
      if (i === undefined || l.entered_at_close_of === i) continue;
      const bar = l.a.d1.bars[i];
      if (l.enter_next_open && l.pos.state === "PENDING") {
        l.enter_next_open = false;
        if (bar.o <= l.pos.stop_price) {
          // Gapped through the stop before the order could fill: the setup is dead.
          l.pos.state = "CANCELLED";
          l.pos.cancel_reason = "GAP_BELOW_STOP";
          l.pos.closed_at = bar.t;
        } else applyExternalFill(l.pos, bar.o * (1 + EXECUTION_RULES.ASSUMED_SLIPPAGE[l.a.asset_class]), l.pos.initial_size, bar.t);
      }
      if (l.exit_next_open && (l.pos.state === "OPEN" || l.pos.state === "RISK_FREE")) {
        forceClose(l.pos, bar.o, l.exit_next_open, bar.t);
      } else if (l.pos.state !== "CANCELLED") {
        const exit = exitDecision(l.sleeve.def, l.a, i, l.pos);
        const deferred = exit !== null && l.a.asset_class === "STOCK" && input.stock_execution === "NEXT_OPEN";
        stepPosition(l.pos, bar, { atr: l.a.d1.atr[i - 1] ?? NaN, force_exit_reason: deferred ? undefined : (exit ?? undefined) });
        if (deferred && (l.pos.state === "OPEN" || l.pos.state === "RISK_FREE")) l.exit_next_open = exit;
      }
      if (l.pos.state === "CLOSED" || l.pos.state === "CANCELLED") {
        settle(l);
        live.splice(k, 1);
      }
    }

    // 2) mark to market
    let mtm = 0;
    for (const l of live) if (l.pos.entry_price !== null) mtm += l.pos.cash_flow + markPrice(l, t) * l.pos.size;
    const equity = cash + mtm;
    if (input.allocation) {
      const prevEquity = curve.length ? curve[curve.length - 1].equity : input.starting_equity;
      bookReturns.push(prevEquity > 0 ? equity / prevEquity - 1 : 0);
      const value = new Map<string, number>([...sleeveReturns.keys()].map((id) => [id, sleeveRealized.get(id) ?? 0]));
      for (const l of live) if (l.pos.entry_price !== null) value.set(l.sleeve.def.id, (value.get(l.sleeve.def.id) ?? 0) + l.pos.cash_flow + markPrice(l, t) * l.pos.size);
      for (const [id, v] of value) {
        sleeveReturns.get(id)?.push(prevEquity > 0 ? (v - (sleevePrev.get(id) ?? 0)) / prevEquity : 0);
        sleevePrev.set(id, v);
      }
    }
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
    curve.push({ t, equity });

    // 3) new signals on today's close, best first across sleeves
    const signals: { sig: Signal; sleeve: Sleeve }[] = [];
    input.sleeves.forEach((s, k) => {
      for (const sig of s.def.scan(bySleeveAssets[k], t, ctx)) signals.push({ sig, sleeve: s });
    });
    signals.sort((x, y) => y.sig.score - x.sig.score);
    for (const { sig, sleeve } of signals) {
      if (live.some((l) => l.a.symbol === sig.a.symbol)) {
        block("ALREADY_IN_SYMBOL");
        continue;
      }
      if (live.length >= env.max_positions) {
        block("MAX_POSITIONS");
        continue;
      }
      if (live.filter((l) => l.sleeve === sleeve).length >= sleeve.max_positions) {
        block(`MAX_${sleeve.def.id}`);
        continue;
      }
      const openRisk = live.reduce((s, l) => s + (l.pos.state === "RISK_FREE" ? 0 : l.risk_pct), 0);
      const riskPct = sleeve.risk_pct * (input.allocation?.(sleeve.def.id, { t, book: bookReturns, sleeves: sleeveReturns }) ?? 1);
      if (openRisk + riskPct > env.max_open_risk + 1e-9) {
        block("MAX_OPEN_RISK");
        continue;
      }
      const stopDist = sig.entry - sig.stop;
      if (!(stopDist > 0)) continue;
      const gross = live.reduce((s, l) => s + markPrice(l, t) * (l.pos.entry_price !== null ? l.pos.size : l.pos.initial_size), 0);
      const room = Math.max(0, env.max_gross * equity - gross);
      let size = (riskPct * equity) / stopDist;
      size = Math.min(size, (env.max_notional * equity) / sig.entry, room / sig.entry);
      if (sig.a.asset_class === "STOCK") size = Math.floor(size);
      if (!(size * sig.entry >= EXECUTION_RULES.MIN_ORDER_NOTIONAL)) {
        block("SIZE");
        continue;
      }
      const pos = positionForSignal(sig, size, sleeve.def.manage);
      const nextOpen = sig.fill === "CLOSE" && sig.a.asset_class === "STOCK" && input.stock_execution === "NEXT_OPEN";
      if (sig.fill === "CLOSE" && !nextOpen) {
        applyExternalFill(pos, sig.entry * (1 + EXECUTION_RULES.ASSUMED_SLIPPAGE[sig.a.asset_class]), size, t);
        if (!(pos.stop_distance > 0)) continue;
      }
      // Risk actually taken, as a fraction of equity (the notional caps can make it smaller than the sleeve's).
      const risk_pct = (size * stopDist) / equity;
      live.push({ pos, a: sig.a, sleeve, risk_pct, entered_at_close_of: sig.fill === "CLOSE" ? sig.i : null, enter_next_open: nextOpen });
    }
  }
  const open_at_end = live.map((l) => ({
    symbol: l.a.symbol,
    strategy: l.sleeve.def.id,
    size: l.pos.size,
    entry: l.pos.entry_price ?? l.pos.entry_limit,
    stop: l.pos.stop_price,
    opened_at: l.pos.opened_at,
    pending: l.pos.state === "PENDING" || Boolean(l.enter_next_open),
  }));
  for (const l of live) {
    const i = closedIdx(l.a.d1, input.end + D1);
    if (i < 0) continue;
    forceClose(l.pos, l.a.d1.bars[i].c, "MANUAL", l.a.d1.bars[i].t);
    settle(l);
  }

  const rets: number[] = [];
  for (let k = 1; k < curve.length; k++) rets.push(curve[k].equity / curve[k - 1].equity - 1);
  const m = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length));
  const days = times.length ? (times[times.length - 1] - times[0]) / D1 : 0;
  // Calendar-day returns (crypto trades every day): annualise with the observed bars per year.
  const perYear = days > 0 ? (curve.length / days) * 365 : 252;
  const years = days / 365;
  const rt = trades.map((x) => ({ ...x, reached_1r: x.mfe_r >= 1 }));
  return {
    stats: computeStats(rt),
    trades,
    equity: curve,
    cagr: years > 0 ? (cash / input.starting_equity) ** (1 / years) - 1 : 0,
    sharpe: rets.length > 30 && sd > 0 ? Math.round((m / sd) * Math.sqrt(perYear) * 100) / 100 : null,
    max_dd: maxDd,
    by_strategy: groupStats(rt, (x) => x.strategy),
    blocked,
    open_at_end,
  };
}
