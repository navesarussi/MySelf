import { RISK_ENVELOPE } from "../config";
import { returnCorrelation } from "../indicators";
import { computeStats, groupStats, monteCarlo, type GroupStat, type MonteCarloResult, type PerformanceStats } from "../metrics";
import { forceClose, newPendingPosition, openRiskR, realizedR, stepPosition, type SimPosition } from "../position";
import { checkNewEntry, shouldTripKillSwitch, weekStartIso } from "../risk-envelope";
import { buildTradePlan } from "../sizing";
import type { AssetClass, Bar } from "../types";
import { buildTfSeries, closedIdx, type TfSeries } from "./series";
import { keyLevels, nextResistance } from "./structure";

/**
 * Strategy family "daily trend": multi-asset (crypto + stocks + ETFs) trend breakouts on daily closes.
 * Research engine with the same position state machine, sizing and risk envelope as live trading.
 * `scanDailyTrendCandidates` / `donchianExitBreached` are the exact functions the LIVE engine calls too —
 * one code path, so the walk-forward numbers in docs/trading/research-2026-09.md are what actually runs.
 */

const D1 = 86_400_000;

export type DailyTrendParams = {
  version: string;
  breakout_days: number;
  exit_days: number;
  stop_atr: number;
  trail_atr: number;
  trail_after_r: number | null;
  breakeven_at_r: number;
  rs_min: number;
  require_reference: boolean;
  require_sma200: boolean;
  max_concurrent: number;
  use_structural_target: boolean;
  min_room_r: number;
};

export const DEFAULT_DAILY_TREND: DailyTrendParams = {
  version: "daily-trend-1",
  breakout_days: 55,
  exit_days: 20,
  stop_atr: 3,
  trail_atr: 3,
  trail_after_r: 0,
  breakeven_at_r: 100,
  rs_min: 0,
  require_reference: true,
  require_sma200: true,
  max_concurrent: RISK_ENVELOPE.MAX_CONCURRENT_POSITIONS,
  use_structural_target: false,
  min_room_r: 2,
};

/** Walk-forward chosen config (docs/trading/research-2026-09.md): 100-day breakout, 3×ATR stop, 3×ATR chandelier trail. */
export const LIVE_DAILY_TREND_PARAMS: DailyTrendParams = {
  ...DEFAULT_DAILY_TREND,
  version: "daily-trend-b100-t3-s3-c5",
  breakout_days: 100,
  exit_days: 20,
  trail_atr: 3,
  stop_atr: 3,
  rs_min: 0,
  max_concurrent: RISK_ENVELOPE.MAX_CONCURRENT_POSITIONS,
};

export type DailyAsset = { symbol: string; asset_class: AssetClass; group: string; d1: TfSeries; sma200: number[]; idx: Map<number, number> };

export function buildDailyAsset(symbol: string, asset_class: AssetClass, group: string, bars: Bar[]): DailyAsset {
  const d1 = buildTfSeries(bars, D1);
  const closes = bars.map((b) => b.c);
  const sma200 = closes.map((_, i) => (i >= 199 ? closes.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200 : NaN));
  return { symbol, asset_class, group, d1, sma200, idx: new Map(bars.map((b, i) => [b.t, i])) };
}

export type DailyTrade = {
  symbol: string;
  group: string;
  asset_class: AssetClass;
  opened_at: number;
  closed_at: number;
  r: number;
  exit_reason: string;
  bars_held: number;
  mfe_r: number;
  rs: number | null;
  room_r: number | null;
  features: EntryFeatures;
};

/** Entry-time features (all from closed bars) — used to learn what separates winners, and fed to the agent. */
export type EntryFeatures = {
  adx: number;
  dist_sma200_atr: number;
  atr_pct: number;
  volume_ratio: number;
  breakout_atr: number;
  squeeze_pct: number | null;
  ret_20d: number;
  ret_252d: number | null;
  days_above_sma200: number;
  reference_margin: number | null;
  rsi: number;
};

function entryFeatures(a: DailyAsset, i: number, ref: DailyAsset | undefined, t: number, breakoutDays: number): EntryFeatures {
  const b = a.d1.bars;
  const atrv = a.d1.atr[i];
  let hi = -Infinity;
  for (let j = i - breakoutDays; j < i; j++) hi = Math.max(hi, b[j].h);
  let days = 0;
  for (let j = i; j >= 0 && b[j].c > a.sma200[j]; j--) days++;
  let refMargin: number | null = null;
  if (ref) {
    const ri = closedIdx(ref.d1, t + D1);
    if (ri >= 0 && Number.isFinite(ref.sma200[ri])) refMargin = ref.d1.bars[ri].c / ref.sma200[ri] - 1;
  }
  let bbBelow = 0;
  let bbN = 0;
  for (let j = Math.max(0, i - 121); j < i - 1; j++) {
    if (!Number.isFinite(a.d1.bbWidth[j])) continue;
    bbN++;
    if (a.d1.bbWidth[j] < a.d1.bbWidth[i - 1]) bbBelow++;
  }
  return {
    adx: a.d1.adx[i],
    dist_sma200_atr: (b[i].c - a.sma200[i]) / atrv,
    atr_pct: atrv / b[i].c,
    volume_ratio: a.d1.volSma[i] > 0 ? b[i].v / a.d1.volSma[i] : 1,
    breakout_atr: (b[i].c - hi) / atrv,
    squeeze_pct: bbN >= 20 ? bbBelow / bbN : null,
    ret_20d: b[i].c / b[i - 20].c - 1,
    ret_252d: i >= 252 ? b[i].c / b[i - 252].c - 1 : null,
    days_above_sma200: days,
    reference_margin: refMargin,
    rsi: a.d1.rsi[i],
  };
}

/** Relative strength: 126-day log return / realized vol, ranked within each group (0..1). */
export function dailyRsRanks(assets: DailyAsset[], t: number) {
  const byGroup = new Map<string, { symbol: string; score: number }[]>();
  for (const a of assets) {
    const i = a.idx.get(t);
    if (i === undefined || i < 127) continue;
    const b = a.d1.bars;
    let v = 0;
    for (let k = i - 125; k <= i; k++) v += Math.log(b[k].c / b[k - 1].c) ** 2;
    const score = Math.log(b[i].c / b[i - 126].c) / (Math.sqrt(v / 126) || 1);
    byGroup.set(a.group, [...(byGroup.get(a.group) ?? []), { symbol: a.symbol, score }]);
  }
  const out = new Map<string, number>();
  for (const list of byGroup.values()) {
    list.sort((x, y) => x.score - y.score);
    list.forEach((x, k) => out.set(x.symbol, list.length > 1 ? k / (list.length - 1) : 0.5));
  }
  return out;
}

export type DailyCandidate = { symbol: string; group: string; a: DailyAsset; i: number; t: number; rs: number | null; room: number | null; stopDist: number; entry: number; stop: number; target: number; features: EntryFeatures };

/**
 * Pure per-day candidate scan (no portfolio/account state) — called by both the backtester and the
 * live engine, so a signal fires identically in research and in production.
 */
export function scanDailyTrendCandidates(assets: DailyAsset[], t: number, references: Record<string, DailyAsset | undefined>, p: DailyTrendParams, ranks?: Map<string, number>): DailyCandidate[] {
  const rs = ranks ?? dailyRsRanks(assets, t);
  const cands: DailyCandidate[] = [];
  for (const a of assets) {
    const i = a.idx.get(t);
    if (i === undefined || i < Math.max(210, p.breakout_days + 1)) continue;
    const bars = a.d1.bars;
    const close = bars[i].c;
    let hi = -Infinity;
    for (let j = i - p.breakout_days; j < i; j++) hi = Math.max(hi, bars[j].h);
    if (!(close > hi)) continue;
    if (p.require_sma200 && !(close > a.sma200[i])) continue;
    if (p.require_reference) {
      const ref = references[a.group];
      if (ref && ref.symbol !== a.symbol) {
        const ri = closedIdx(ref.d1, t + D1);
        if (ri < 0 || !(ref.d1.bars[ri].c > ref.sma200[ri])) continue;
      }
    }
    const rank = rs.get(a.symbol) ?? null;
    if (rank !== null && rank < p.rs_min) continue;
    const atrv = a.d1.atr[i];
    if (!Number.isFinite(atrv)) continue;
    const stopDist = p.stop_atr * atrv;
    const res = nextResistance(keyLevels(a.d1, i, 400), close + 0.25 * stopDist, 2);
    const room = res ? (res.price - close) / stopDist : null;
    if (room !== null && room < p.min_room_r) continue;
    const target = p.use_structural_target && res ? res.price : close + 100 * stopDist;
    const features = entryFeatures(a, i, references[a.group], t, p.breakout_days);
    cands.push({ symbol: a.symbol, group: a.group, a, i, t, rs: rank, room, stopDist, entry: close, stop: close - stopDist, target, features });
  }
  return cands;
}

/**
 * Confluence score (0-100, display/journal only — NOT an entry gate; research found hard-filtering on
 * these only marginally helped out of sample, see docs/trading/research-2026-09.md).
 */
export function scoreDailyCandidate(f: EntryFeatures, rs: number | null): number {
  let s = 0;
  if (f.volume_ratio >= 1.2) s += 25;
  if (f.squeeze_pct !== null && f.squeeze_pct <= 0.5) s += 25;
  s += f.adx <= 32 ? 20 : -10;
  if (f.breakout_atr > 0.3) s += 15;
  if (rs !== null && rs > 0.5) s += 15;
  return Math.max(0, Math.min(100, s));
}

/**
 * The 20-day-low Donchian exit — a close below the rolling low, checked once per day.
 * Takes a daily `TfSeries` directly (not a full `DailyAsset`) so the live engine can reuse the daily
 * series it already has on `SymbolFrames.d1` for any open position, without building a separate DailyAsset.
 */
export function donchianExitBreached(daily: TfSeries, i: number, exitDays: number): boolean {
  if (i <= exitDays) return false;
  let lo = Infinity;
  for (let j = i - exitDays; j < i; j++) lo = Math.min(lo, daily.bars[j].l);
  return daily.bars[i].c < lo;
}

export type DailyResult = {
  params: DailyTrendParams;
  stats: PerformanceStats;
  trades: DailyTrade[];
  cagr: number;
  sharpe: number | null;
  max_dd: number;
  exposure: number;
  kill_switch_at: number | null;
  equity: { t: number; equity: number }[];
  by_group: GroupStat[];
  by_exit: GroupStat[];
  monte_carlo: MonteCarloResult;
  blocked: Record<string, number>;
};

export function runDailyTrend(input: {
  assets: DailyAsset[];
  references: Record<string, DailyAsset | undefined>;
  params: DailyTrendParams;
  start: number;
  end: number;
  starting_equity: number;
  /** Optional entry filter (research: learned rules / agent decisions). */
  filter?: (c: DailyCandidate) => boolean;
  /** Optional priority when capacity is limited (higher first); default = relative strength. */
  priority?: (c: { symbol: string; t: number; rs: number | null }) => number;
}): DailyResult {
  const p = input.params;
  const times = [...new Set(input.assets.flatMap((a) => a.d1.bars.map((b) => b.t)))].filter((t) => t >= input.start && t <= input.end).sort((a, b) => a - b);
  let cash = input.starting_equity;
  let peak = cash;
  let maxDd = 0;
  let killAt: number | null = null;
  let exposed = 0;
  const curve: { t: number; equity: number }[] = [];
  const trades: DailyTrade[] = [];
  const blocked: Record<string, number> = {};
  const rByDay = new Map<string, number>();
  const rByWeek = new Map<string, number>();
  type Live = { pos: SimPosition; a: DailyAsset; rs: number | null; room: number | null; features: EntryFeatures };
  const live: Live[] = [];

  const settle = (l: Live) => {
    if (l.pos.state === "CANCELLED") return;
    cash += l.pos.cash_flow;
    const r = realizedR(l.pos);
    const at = l.pos.closed_at ?? 0;
    const day = new Date(at).toISOString().slice(0, 10);
    rByDay.set(day, (rByDay.get(day) ?? 0) + r);
    rByWeek.set(weekStartIso(new Date(at)), (rByWeek.get(weekStartIso(new Date(at))) ?? 0) + r);
    trades.push({ symbol: l.a.symbol, group: l.a.group, asset_class: l.a.asset_class, opened_at: l.pos.opened_at ?? at, closed_at: at, r, exit_reason: l.pos.exit_reason ?? "?", bars_held: l.pos.bars_held, mfe_r: l.pos.mfe_r, rs: l.rs, room_r: l.room, features: l.features });
  };

  for (const t of times) {
    // 1) manage on today's bar
    for (let k = live.length - 1; k >= 0; k--) {
      const l = live[k];
      const i = l.a.idx.get(t);
      if (i === undefined) continue;
      const donchianExit = l.pos.entry_price !== null && donchianExitBreached(l.a.d1, i, p.exit_days);
      stepPosition(l.pos, l.a.d1.bars[i], {
        atr: l.a.d1.atr[i - 1] ?? NaN,
        force_exit_reason: donchianExit ? "TRAIL" : undefined,
      });
      if (l.pos.state === "CLOSED" || l.pos.state === "CANCELLED") {
        settle(l);
        live.splice(k, 1);
      }
    }

    // 2) mark to market
    let mtm = 0;
    for (const l of live) {
      if (l.pos.entry_price === null) continue;
      const i = closedIdx(l.a.d1, t + D1);
      mtm += l.pos.cash_flow + (i >= 0 ? l.a.d1.bars[i].c : l.pos.entry_price) * l.pos.size;
    }
    const equity = cash + mtm;
    if (live.some((l) => l.pos.entry_price !== null)) exposed += 1;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
    curve.push({ t, equity });
    if (killAt === null && shouldTripKillSwitch(equity, peak)) {
      killAt = t;
      for (const l of live) {
        const i = closedIdx(l.a.d1, t + D1);
        forceClose(l.pos, i >= 0 ? l.a.d1.bars[i].c : (l.pos.entry_price ?? l.pos.entry_limit), "KILL_SWITCH", t);
        settle(l);
      }
      live.length = 0;
    }
    if (killAt !== null) continue;

    // 3) scan today's close
    const ranks = dailyRsRanks(input.assets, t);
    let cands = scanDailyTrendCandidates(input.assets, t, input.references, p, ranks);
    if (input.filter) {
      const before = cands.length;
      cands = cands.filter(input.filter);
      if (before !== cands.length) blocked.FILTER = (blocked.FILTER ?? 0) + (before - cands.length);
    }
    const prio = input.priority;
    cands.sort((x, y) => (prio ? prio({ symbol: y.symbol, t, rs: y.rs }) - prio({ symbol: x.symbol, t, rs: x.rs }) : 0) || (y.rs ?? 0.5) - (x.rs ?? 0.5));
    const dayIso = new Date(t).toISOString().slice(0, 10);
    for (const c of cands) {
      if (live.length >= p.max_concurrent) {
        blocked.MAX_CONCURRENT = (blocked.MAX_CONCURRENT ?? 0) + 1;
        break;
      }
      const correlated: string[] = [];
      for (const l of live) {
        const oi = closedIdx(l.a.d1, t + D1);
        if (c.i < 61 || oi < 61) continue;
        const rho = returnCorrelation(c.a.d1.bars.slice(c.i - 60, c.i + 1).map((b) => b.c), l.a.d1.bars.slice(oi - 60, oi + 1).map((b) => b.c));
        if (rho !== null && Math.abs(rho) >= RISK_ENVELOPE.CORRELATION_THRESHOLD) correlated.push(l.a.symbol);
      }
      const blocks = checkNewEntry(
        {
          equity,
          peak_equity: peak,
          realized_r_today: rByDay.get(dayIso) ?? 0,
          realized_r_week: rByWeek.get(weekStartIso(new Date(t))) ?? 0,
          kill_switch_active: false,
          entries_paused: false,
          positions: live.map((l) => ({ symbol: l.a.symbol, notional: l.pos.entry_limit * l.pos.size, open_risk_r: openRiskR(l.pos) })),
        },
        c.symbol,
        correlated
      ).filter((b) => b !== "MAX_CONCURRENT"); // the concurrency cap is the research parameter (checked above)
      if (blocks.length) {
        blocks.forEach((b) => (blocked[b] = (blocked[b] ?? 0) + 1));
        continue;
      }
      const plan = buildTradePlan({ entry: c.entry, stopDistance: c.stopDist, equity, assetClass: c.a.asset_class, riskScale: 1 });
      if (!plan) continue;
      const pos = newPendingPosition({ asset_class: c.a.asset_class, entry: plan.entry, stop: plan.stop, size: plan.size });
      pos.exit_plan = "STRUCTURAL";
      pos.target_price = c.target;
      pos.initial_target_price = c.target;
      pos.breakeven_at_r = p.breakeven_at_r;
      pos.partial_fraction = 0;
      pos.trail_after_r = p.trail_after_r;
      pos.trail_mult = p.trail_atr;
      live.push({ pos, a: c.a, rs: c.rs, room: c.room, features: c.features });
    }
  }
  for (const l of live) {
    const last = l.a.d1.bars[closedIdx(l.a.d1, input.end + D1)];
    if (last) {
      forceClose(l.pos, last.c, "MANUAL", last.t);
      settle(l);
    }
  }

  const byDay = new Map<number, number>();
  for (const c of curve) byDay.set(Math.floor(c.t / D1), c.equity);
  const eq = [...byDay.values()];
  const rets: number[] = [];
  for (let i = 1; i < eq.length; i++) rets.push(eq[i] / eq[i - 1] - 1);
  const m = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length));
  const years = (input.end - input.start) / (365 * D1);
  const rt = trades.map((x) => ({ ...x, reached_1r: x.mfe_r >= 1 }));
  const avgRisk = input.assets.reduce((s, a) => s + RISK_ENVELOPE.MAX_RISK_PER_TRADE[a.asset_class], 0) / Math.max(1, input.assets.length);
  return {
    params: p,
    stats: computeStats(rt),
    trades,
    cagr: years > 0 ? (cash / input.starting_equity) ** (1 / years) - 1 : 0,
    sharpe: rets.length > 30 && sd > 0 ? Math.round((m / sd) * Math.sqrt(252) * 100) / 100 : null,
    max_dd: maxDd,
    exposure: times.length ? exposed / times.length : 0,
    kill_switch_at: killAt,
    equity: curve,
    by_group: groupStats(rt, (x) => x.group),
    by_exit: groupStats(rt, (x) => x.exit_reason),
    monte_carlo: monteCarlo(rt.map((x) => x.r), avgRisk),
    blocked,
  };
}
