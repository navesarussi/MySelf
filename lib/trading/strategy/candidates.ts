import { RISK_ENVELOPE } from "../config";
import type { AssetClass, Bar } from "../types";
import { closedIdx, confirmedSwings, percentileRank, type TfSeries } from "./series";
import { bearishDivergence, keyLevels, lastSwingLowBelow, nextResistance, structureState, type StructureState } from "./structure";

/**
 * Strategy v2 — deterministic half of the trading strategy.
 * Multi-timeframe: daily = context/regime, 4h = setup, 1h = entry timing, stop placement and management.
 */

export type StrategyV2Params = {
  version: string;
  min_score: number;
  breakout_lookback: number;
  squeeze_pct: number;
  breakout_volume_mult: number;
  pullback_rsi_low: number;
  pullback_rsi_high: number;
  stop_buffer_atr1h: number;
  min_stop_atr4h: number;
  max_stop_atr4h: number;
  blue_sky_r: number;
  breakeven_at_r: number;
  partial_fraction: number;
  trail_after_r: number | null;
  trail_mult_atr4h: number;
  extension_enabled: boolean;
  setups: SetupType[];
};

export type SetupType = "PULLBACK" | "BREAKOUT";

/**
 * Defaults chosen by walk-forward research (2026-09): crypto IS 2021-07→2024-03 / OOS 2024-03→2026-09.
 * Breakout from compression with score ≥ 60 was the only family positive in both windows (crypto and stocks);
 * the pullback detector lost out of sample in both and is kept only for research.
 */
export const DEFAULT_V2_PARAMS: StrategyV2Params = {
  version: "v2-breakout-1",
  min_score: 60,
  breakout_lookback: 30,
  squeeze_pct: 0.35,
  breakout_volume_mult: 1.3,
  pullback_rsi_low: 38,
  pullback_rsi_high: 60,
  stop_buffer_atr1h: 0.3,
  min_stop_atr4h: 1,
  max_stop_atr4h: 3,
  blue_sky_r: 3,
  breakeven_at_r: 1,
  partial_fraction: 0,
  trail_after_r: 2,
  trail_mult_atr4h: 3,
  extension_enabled: true,
  setups: ["BREAKOUT"],
};

/**
 * AI-discretion pool: a wider opportunity set (both setups, lower score floor) from which הסוכן מסחר picks.
 * The deterministic baseline still only "takes" candidates that pass DEFAULT_V2_PARAMS — measured separately.
 * Hard rules (≥ 2R, structural stop, envelope) apply to every pool candidate.
 */
export const DISCRETION_POOL_PARAMS: StrategyV2Params = {
  ...DEFAULT_V2_PARAMS,
  version: "v2-ai-pool-1",
  min_score: 40,
  setups: ["BREAKOUT", "PULLBACK"],
};

export function isBaselineCandidate(c: Pick<Candidate, "setup" | "score">, baseline: StrategyV2Params = DEFAULT_V2_PARAMS) {
  return baseline.setups.includes(c.setup) && c.score >= baseline.min_score;
}

export type SymbolFrames = {
  symbol: string;
  asset_class: AssetClass;
  d1: TfSeries;
  h4: TfSeries;
  h1: TfSeries;
};

export type MarketContext = {
  /** Regime reference (SPY / BTC) is above its daily EMA200. null when the symbol is its own reference. */
  reference_ok: boolean | null;
  /** Relative-strength percentile of this symbol inside its universe (0 weakest … 1 strongest). */
  rs_rank: number | null;
  /** Share of the universe closing above its daily EMA50. */
  breadth: number | null;
};

export type Candidate = {
  symbol: string;
  asset_class: AssetClass;
  setup: SetupType;
  t: number;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  score: number;
  target_kind: "RESISTANCE" | "BLUE_SKY";
  /** Deterministic target menu for the agent: [0] = structural target, further levels after (all ≥ MIN_RR). */
  target_menu: { price: number; rr: number; kind: string }[];
  factors: Record<string, number | string | boolean | null>;
  reasons: string[];
};

const round = (x: number, d = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

/** Analyst-style multi-timeframe read of one symbol at time t (closed bars only). Also fed to the AI agent. */
export function analystBrief(f: SymbolFrames, t: number) {
  const id = closedIdx(f.d1, t);
  const i4 = closedIdx(f.h4, t);
  const i1 = closedIdx(f.h1, t);
  if (id < 210 || i4 < 210 || i1 < 60) return null;
  const d = f.d1;
  const h4 = f.h4;
  const h1 = f.h1;
  const close = h1.bars[i1].c;
  const dailyLevels = keyLevels(d, id, 400);
  const h4Levels = keyLevels(h4, i4, 300);
  const res = nextResistance([...dailyLevels, ...h4Levels], close, 2);
  const sup = [...dailyLevels, ...h4Levels].filter((l) => l.price < close && l.touches >= 2).sort((a, b) => b.price - a.price)[0] ?? null;
  const tfRead = (s: TfSeries, i: number) => ({
    trend: (s.bars[i].c > s.ema50[i] && s.ema50[i] > s.ema200[i] ? "UP" : s.bars[i].c < s.ema50[i] && s.ema50[i] < s.ema200[i] ? "DOWN" : "MIXED") as "UP" | "DOWN" | "MIXED",
    structure: structureState(s, i) as StructureState,
    rsi: round(s.rsi[i], 1),
    adx: round(s.adx[i], 1),
    atr_pct: round(s.atr[i] / s.bars[i].c),
    volume_ratio: s.volSma[i] > 0 ? round(s.bars[i].v / s.volSma[i], 2) : null,
    squeeze_pct: percentileRank(s.bbWidth, i, 120),
    bearish_divergence: bearishDivergence(s, i),
    dist_ema20_atr: round((s.bars[i].c - s.ema20[i]) / s.atr[i], 2),
  });
  return {
    close,
    daily: { ...tfRead(d, id), ema200_slope_pos: d.ema200[id] > d.ema200[id - 10], ret_20d: round(d.bars[id].c / d.bars[id - 20].c - 1), ret_90d: round(d.bars[id].c / d.bars[id - 90].c - 1) },
    h4: tfRead(h4, i4),
    h1: tfRead(h1, i1),
    nearest_resistance: res ? { price: round(res.price, 6), touches: res.touches, dist_atr4h: round((res.price - close) / h4.atr[i4], 2) } : null,
    nearest_support: sup ? { price: round(sup.price, 6), touches: sup.touches, dist_atr4h: round((close - sup.price) / h4.atr[i4], 2) } : null,
    idx: { id, i4, i1 },
  };
}

export type AnalystBrief = NonNullable<ReturnType<typeof analystBrief>>;

export function evaluateCandidates(f: SymbolFrames, t: number, market: MarketContext, p: StrategyV2Params): { candidates: Candidate[]; rejected: string[] } {
  const rejected: string[] = [];
  const i4 = closedIdx(f.h4, t);
  // Setups are only evaluated on a fresh 4h close.
  if (i4 < 0 || f.h4.bars[i4].t + f.h4.ms !== t) return { candidates: [], rejected: ["NOT_4H_CLOSE"] };
  const brief = analystBrief(f, t);
  if (!brief) return { candidates: [], rejected: ["WARMUP"] };
  const { id, i1 } = brief.idx;
  const d = f.d1;
  const h4 = f.h4;
  const h1 = f.h1;
  const a4 = h4.atr[i4];
  const close = h4.bars[i4].c;

  // Hard context filters (long only, with the trend).
  if (!(d.bars[id].c > d.ema200[id])) rejected.push("DAILY_BELOW_EMA200");
  if (!brief.daily.ema200_slope_pos) rejected.push("DAILY_EMA200_FALLING");
  if (market.reference_ok === false) rejected.push("REFERENCE_REGIME_OFF");
  if (rejected.length) return { candidates: [], rejected };

  const setups: { setup: SetupType; rawStop: number }[] = [];

  if (p.setups.includes("PULLBACK")) {
    let touched = false;
    let minRsi = Infinity;
    for (let k = i4 - 5; k <= i4; k++) {
      if (h4.bars[k].l <= h4.ema20[k] + 0.3 * h4.atr[k]) touched = true;
      minRsi = Math.min(minRsi, h4.rsi[k]);
    }
    const trendOk = h4.ema20[i4] > h4.ema50[i4] && close > h4.ema50[i4];
    const rsiOk = minRsi >= p.pullback_rsi_low && minRsi <= p.pullback_rsi_high;
    // 1h timing: the hourly close breaks the high of the prior 5 hours, above its EMA20.
    let prior1hHigh = -Infinity;
    for (let k = i1 - 5; k < i1; k++) prior1hHigh = Math.max(prior1hHigh, h1.bars[k].h);
    const timingOk = h1.bars[i1].c > prior1hHigh && h1.bars[i1].c > h1.ema20[i1];
    if (trendOk && touched && rsiOk && timingOk) {
      const swing = lastSwingLowBelow(h1, i1, close, 48) ?? Math.min(...h4.bars.slice(i4 - 5, i4 + 1).map((b) => b.l));
      setups.push({ setup: "PULLBACK", rawStop: swing - p.stop_buffer_atr1h * h1.atr[i1] });
    } else rejected.push(`PULLBACK:${[!trendOk && "trend", !touched && "touch", !rsiOk && "rsi", !timingOk && "1h"].filter(Boolean).join("+")}`);
  }

  if (p.setups.includes("BREAKOUT")) {
    let prevHigh = -Infinity;
    for (let k = i4 - p.breakout_lookback; k < i4; k++) prevHigh = Math.max(prevHigh, h4.bars[k].h);
    const squeeze = percentileRank(h4.bbWidth, i4 - 1, 120);
    const vol = h4.volSma[i4] > 0 ? h4.bars[i4].v / h4.volSma[i4] : 0;
    const broke = close > prevHigh;
    const squeezeOk = squeeze !== null && squeeze <= p.squeeze_pct;
    const volOk = vol >= p.breakout_volume_mult;
    if (broke && squeezeOk && volOk && d.bars[id].c > d.ema50[id]) {
      const base = Math.min(...h4.bars.slice(i4 - 6, i4).map((b) => b.l));
      setups.push({ setup: "BREAKOUT", rawStop: base - p.stop_buffer_atr1h * h1.atr[i1] });
    } else rejected.push(`BREAKOUT:${[!broke && "nobreak", !squeezeOk && "nosqueeze", !volOk && "vol"].filter(Boolean).join("+")}`);
  }

  const candidates: Candidate[] = [];
  for (const s of setups) {
    // Stop from structure, clamped to a sane ATR band (too tight = noise, too wide = no R).
    let stopDist = close - s.rawStop;
    stopDist = Math.min(Math.max(stopDist, p.min_stop_atr4h * a4), p.max_stop_atr4h * a4);
    const stop = close - stopDist;
    // Target from structure: first meaningful resistance; must leave ≥ MIN_RR, else no trade.
    const levels = [...keyLevels(d, id, 400), ...keyLevels(h4, i4, 300)];
    const res = nextResistance(levels, close + 0.25 * stopDist, 2);
    let target: number;
    let kind: Candidate["target_kind"];
    if (res) {
      target = res.price - 0.1 * a4;
      kind = "RESISTANCE";
    } else {
      target = close + p.blue_sky_r * stopDist;
      kind = "BLUE_SKY";
    }
    const rr = (target - close) / stopDist;
    if (rr < RISK_ENVELOPE.MIN_RR_RATIO) {
      rejected.push(`${s.setup}:RR_${rr.toFixed(2)}`);
      continue;
    }
    const menu: Candidate["target_menu"] = [{ price: target, rr: round(rr, 2), kind }];
    let cursor = target;
    for (let k = 0; k < 2; k++) {
      const further = nextResistance(levels, cursor + 0.75 * stopDist, 2);
      const price = further ? further.price - 0.1 * a4 : cursor + 2 * stopDist;
      menu.push({ price, rr: round((price - close) / stopDist, 2), kind: further ? "RESISTANCE" : "EXTENDED" });
      cursor = price;
    }
    const factors = scoreFactors(brief, market, rr);
    const score = Math.max(0, Math.min(100, Object.values(factors.points).reduce((x, y) => x + y, 0)));
    if (score < p.min_score) {
      rejected.push(`${s.setup}:SCORE_${score}`);
      continue;
    }
    candidates.push({
      symbol: f.symbol,
      asset_class: f.asset_class,
      setup: s.setup,
      t,
      entry: close,
      stop,
      target,
      rr: round(rr, 2),
      score,
      target_kind: kind,
      target_menu: menu,
      factors: { ...factors.points, rs_rank: market.rs_rank, breadth: market.breadth, stop_atr4h: round(stopDist / a4, 2) },
      reasons: factors.reasons,
    });
  }
  return { candidates, rejected };
}

/** Transparent confluence score — every point has a named reason (shown in the journal). */
export function scoreFactors(b: AnalystBrief, m: MarketContext, rr: number) {
  const points: Record<string, number> = {};
  const reasons: string[] = [];
  const add = (key: string, pts: number, why: string) => {
    points[key] = pts;
    if (pts !== 0) reasons.push(`${pts > 0 ? "+" : ""}${pts} ${why}`);
  };
  add("daily_structure", b.daily.structure === "UPTREND" ? 20 : b.daily.trend === "UP" ? 10 : 0, "daily uptrend");
  add("h4_adx", (b.h4.adx ?? 0) > 25 ? 15 : (b.h4.adx ?? 0) > 20 ? 8 : 0, "4h trend strength");
  add("relative_strength", m.rs_rank !== null ? Math.round(m.rs_rank * 15) : 7, "relative strength vs universe");
  add("volume", (b.h4.volume_ratio ?? 0) >= 1.2 ? 10 : 0, "volume expansion");
  add("room", rr >= 3 ? 10 : rr >= 2.5 ? 5 : 0, "room to target");
  add("breadth", m.breadth !== null && m.breadth > 0.5 ? 10 : 0, "healthy market breadth");
  add("h1_structure", b.h1.structure === "UPTREND" ? 10 : 0, "1h structure aligned");
  add("daily_divergence", b.daily.bearish_divergence ? -15 : 0, "daily bearish divergence");
  add("daily_extension", (b.daily.dist_ema20_atr ?? 0) > 2.5 ? -10 : 0, "over-extended above daily EMA20");
  return { points, reasons };
}

/**
 * TP extension ("conditions mature"): decided at a closed bar, applied to the next bar.
 * Only when price is within 0.5R of target and trend is still strengthening. The new stop locks
 * at least (old target − 1R) so an extension can never turn a winner back into a loser.
 */
export function extensionDecision(input: {
  f: SymbolFrames;
  t: number;
  entry: number;
  stop: number;
  target: number;
  stopDistance: number;
  lastClose: number;
}): { raise_target_to: number; raise_stop_to: number; reason: string } | null {
  const { f, t, entry, target, stopDistance: R, lastClose } = input;
  if (lastClose < target - 0.5 * R) return null;
  const i4 = closedIdx(f.h4, t);
  const id = closedIdx(f.d1, t);
  if (i4 < 5 || id < 5) return null;
  const h4 = f.h4;
  const strengthening = h4.adx[i4] >= 22 && h4.adx[i4] > h4.adx[i4 - 3];
  const aligned = h4.bars[i4].c > h4.ema20[i4] && f.d1.bars[id].c > f.d1.ema50[id];
  const noDiv = !bearishDivergence(h4, i4) && !bearishDivergence(f.d1, id);
  const volOk = h4.volSma[i4] > 0 ? h4.bars[i4].v / h4.volSma[i4] >= 0.8 : true;
  if (!(strengthening && aligned && noDiv && volOk)) return null;
  const levels = [...keyLevels(f.d1, id, 400), ...keyLevels(h4, i4, 300)];
  const res = nextResistance(levels, target + R, 2);
  const newTarget = res ? res.price - 0.1 * h4.atr[i4] : target + 2 * R;
  const lock = Math.max(entry, target - R);
  if (!(newTarget > target) || !(lock < lastClose)) return null;
  return { raise_target_to: newTarget, raise_stop_to: lock, reason: `ADX ${h4.adx[i4].toFixed(0)}↑, 4h>EMA20, daily>EMA50, no divergence` };
}

/** Cross-sectional context at a daily index per symbol: RS rank (60d return / 60d vol) and breadth. */
export function universeContext(frames: SymbolFrames[], t: number) {
  const rows = frames
    .map((f) => {
      const id = closedIdx(f.d1, t);
      if (id < 61) return null;
      const bars = f.d1.bars;
      let v = 0;
      for (let k = id - 59; k <= id; k++) v += Math.log(bars[k].c / bars[k - 1].c) ** 2;
      const vol = Math.sqrt(v / 60) || 1;
      return { symbol: f.symbol, score: Math.log(bars[id].c / bars[id - 60].c) / vol, above50: bars[id].c > f.d1.ema50[id] };
    })
    .filter((x): x is { symbol: string; score: number; above50: boolean } => x !== null);
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const rank = new Map(sorted.map((r, i) => [r.symbol, sorted.length > 1 ? i / (sorted.length - 1) : 0.5]));
  const breadth = rows.length ? rows.filter((r) => r.above50).length / rows.length : null;
  return { rank, breadth };
}

export function lastBars(s: TfSeries, idx: number, n: number): Bar[] {
  return s.bars.slice(Math.max(0, idx - n + 1), idx + 1);
}

export { confirmedSwings };
