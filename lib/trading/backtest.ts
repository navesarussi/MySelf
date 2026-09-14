import { RISK_ENVELOPE, type StrategyParams } from "./config";
import { ema, returnCorrelation } from "./indicators";
import { computeStats, equityCurveR, monteCarlo, rDistribution, type MonteCarloResult, type PerformanceStats } from "./metrics";
import { forceClose, newPendingPosition, openRiskR, realizedR, stepPosition, type SimPosition } from "./position";
import { checkNewEntry, shouldTripKillSwitch, weekStartIso } from "./risk-envelope";
import { buildSetupSeries, buildTradePlan, evaluateSetup, stopDistanceFor, type SetupSeries } from "./setup";
import { bucketId, screenMetricsAt } from "./universe";
import type { AssetClass, Bar, ExitPlan } from "./types";
import type { CalendarEvent } from "./veto";

/** Deterministic, portfolio-level backtester (phase 1). No agent involved. */

export type BacktestVariant = "PARTIAL_TARGET" | "PARTIAL_TRAIL" | "NO_PARTIAL";
export const BACKTEST_VARIANTS: BacktestVariant[] = ["PARTIAL_TARGET", "PARTIAL_TRAIL", "NO_PARTIAL"];

export type BacktestSymbolData = {
  symbol: string;
  asset_class: AssetClass;
  entry: Bar[];
  entryMs: number;
  trend: Bar[];
  trendMs: number;
  /** Daily bars of this symbol (for bucket, correlation). When trend is daily pass the same array. */
  daily: Bar[];
};

export type BacktestInput = {
  symbols: BacktestSymbolData[];
  /** Daily bars for regime references: key = asset class ("STOCK" → SPY, crypto alts → BTC). */
  market: Partial<Record<AssetClass, Bar[]>>;
  params: StrategyParams;
  variant: BacktestVariant;
  starting_equity: number;
  /** Only trade bars with t >= start (earlier bars are warm-up). */
  start: number;
  end: number;
  calendar?: CalendarEvent[];
};

export type BacktestTrade = {
  symbol: string;
  asset_class: AssetClass;
  bucket_id: string;
  trigger_at: number;
  opened_at: number;
  closed_at: number;
  entry_price: number;
  stop_price: number;
  target_price: number;
  exit_price: number;
  exit_reason: string;
  size: number;
  risk_amount: number;
  reached_1r: boolean;
  gapped_through_stop: boolean;
  r: number;
  fees_paid: number;
  mfe_r: number;
  mae_r: number;
  bars_held: number;
};

export type BacktestResult = {
  variant: BacktestVariant;
  stats: PerformanceStats;
  trades: BacktestTrade[];
  equity_curve: { t: number; equity: number }[];
  r_curve: { t: number; cum_r: number }[];
  r_distribution: { bin: number; count: number }[];
  monte_carlo: MonteCarloResult;
  final_equity: number;
  return_pct: number;
  max_equity_dd_pct: number;
  benchmark_return_pct: number | null;
  triggers: number;
  blocked: Record<string, number>;
  cancelled: Record<string, number>;
  kill_switch_tripped_at: number | null;
};

type Live = {
  pos: SimPosition;
  sym: BacktestSymbolData;
  trigger_at: number;
  bucket: string;
};

function barIndexMap(bars: Bar[]) {
  const m = new Map<number, number>();
  bars.forEach((b, i) => m.set(b.t, i));
  return m;
}

function dailyIndexAt(daily: Bar[], t: number) {
  // Last daily bar that closed at or before t.
  let lo = 0;
  let hi = daily.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (daily[mid].t + 86_400_000 <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const { params, variant } = input;
  const exitPlan: ExitPlan = variant === "PARTIAL_TRAIL" ? "TRAIL_2ATR" : "TARGET_2R";
  const prepared = input.symbols.map((sym) => {
    const marketBars =
      sym.asset_class === "CRYPTO_MAJOR" ? undefined : sym.symbol === "SPY" ? undefined : input.market[sym.asset_class];
    const series = buildSetupSeries({ entry: sym.entry, entryMs: sym.entryMs, trend: sym.trend, trendMs: sym.trendMs, market: marketBars });
    return { sym, series, idx: barIndexMap(sym.entry), dailyCloses: sym.daily.map((b) => b.c) };
  });

  const times = [...new Set(prepared.flatMap((p) => p.sym.entry.map((b) => b.t)))]
    .filter((t) => t >= input.start && t <= input.end)
    .sort((a, b) => a - b);

  let cash = input.starting_equity;
  let peak = cash;
  const live: Live[] = [];
  const trades: BacktestTrade[] = [];
  const equityCurve: { t: number; equity: number }[] = [];
  const blocked: Record<string, number> = {};
  const cancelled: Record<string, number> = {};
  let triggers = 0;
  let killAt: number | null = null;
  let maxDdPct = 0;
  const macroDays = new Set((input.calendar ?? []).filter((e) => e.kind === "CPI" || e.kind === "FOMC").map((e) => e.date));

  const rByDay = new Map<string, number>();
  const rByWeek = new Map<string, number>();

  const regimeFlip = (s: SetupSeries, i: number) => {
    const ti = s.trendIdx[i];
    if (i === 0 || ti < 0 || ti === s.trendIdx[i - 1]) return false;
    const e200 = s.trendEma200[ti];
    return Number.isFinite(e200) && s.trend[ti].c < e200;
  };

  const settle = (l: Live) => {
    const p = l.pos;
    if (p.state === "CANCELLED") {
      cancelled[p.cancel_reason ?? "?"] = (cancelled[p.cancel_reason ?? "?"] ?? 0) + 1;
      return;
    }
    cash += p.cash_flow;
    const r = realizedR(p);
    const closedAt = p.closed_at ?? 0;
    const day = new Date(closedAt).toISOString().slice(0, 10);
    const week = weekStartIso(new Date(closedAt));
    rByDay.set(day, (rByDay.get(day) ?? 0) + r);
    rByWeek.set(week, (rByWeek.get(week) ?? 0) + r);
    trades.push({
      symbol: l.sym.symbol,
      asset_class: l.sym.asset_class,
      bucket_id: l.bucket,
      trigger_at: l.trigger_at,
      opened_at: p.opened_at ?? l.trigger_at,
      closed_at: closedAt,
      entry_price: p.entry_price ?? p.entry_limit,
      stop_price: p.entry_price !== null ? p.entry_price - p.stop_distance : p.stop_price,
      target_price: p.target_price,
      exit_price: p.exit_price ?? 0,
      exit_reason: p.exit_reason ?? "?",
      size: p.initial_size,
      risk_amount: p.initial_size * p.stop_distance,
      reached_1r: p.reached_1r,
      gapped_through_stop: p.gapped_through_stop,
      r,
      fees_paid: p.fees_paid,
      mfe_r: p.mfe_r,
      mae_r: p.mae_r,
      bars_held: p.bars_held,
    });
  };

  for (const t of times) {
    // 1) Step open positions on this bar.
    for (let k = live.length - 1; k >= 0; k--) {
      const l = live[k];
      const prep = prepared.find((p) => p.sym === l.sym)!;
      const i = prep.idx.get(t);
      if (i === undefined) continue;
      stepPosition(l.pos, prep.sym.entry[i], {
        atr: prep.series.atr[i],
        trail_atr_mult: params.trail_atr_mult,
        regime_flip: regimeFlip(prep.series, i),
      });
      if (l.pos.state === "CLOSED" || l.pos.state === "CANCELLED") {
        settle(l);
        live.splice(k, 1);
      }
    }

    // 2) Mark to market → kill switch.
    let unrealized = 0;
    for (const l of live) {
      const prep = prepared.find((p) => p.sym === l.sym)!;
      const i = prep.idx.get(t);
      const px = i !== undefined ? prep.sym.entry[i].c : (l.pos.entry_price ?? l.pos.entry_limit);
      if (l.pos.entry_price !== null) unrealized += l.pos.cash_flow + px * l.pos.size;
    }
    const equity = cash + unrealized;
    peak = Math.max(peak, equity);
    maxDdPct = Math.max(maxDdPct, 1 - equity / peak);
    equityCurve.push({ t, equity });
    if (killAt === null && shouldTripKillSwitch(equity, peak)) {
      killAt = t;
      for (const l of live) {
        const prep = prepared.find((p) => p.sym === l.sym)!;
        const i = prep.idx.get(t);
        forceClose(l.pos, i !== undefined ? prep.sym.entry[i].c : (l.pos.entry_price ?? 0), "KILL_SWITCH", t);
        settle(l);
      }
      live.length = 0;
    }
    if (killAt !== null) continue;

    // 3) Scan for new setups closing on this bar.
    const day = new Date(t).toISOString().slice(0, 10);
    for (const prep of prepared) {
      const i = prep.idx.get(t);
      if (i === undefined) continue;
      const res = evaluateSetup(prep.series, i, params);
      if (!res.triggered || !res.snapshot) continue;
      triggers += 1;
      const block = (code: string) => (blocked[code] = (blocked[code] ?? 0) + 1);
      if (macroDays.has(day)) {
        block("MACRO_EVENT_DAY");
        continue;
      }
      const di = dailyIndexAt(prep.sym.daily, t + prep.sym.entryMs);
      const correlated: string[] = [];
      for (const l of live) {
        const other = prepared.find((p) => p.sym === l.sym)!;
        const oi = dailyIndexAt(other.sym.daily, t + prep.sym.entryMs);
        if (di < 61 || oi < 61) continue;
        const rho = returnCorrelation(prep.dailyCloses.slice(di - 60, di + 1), other.dailyCloses.slice(oi - 60, oi + 1));
        if (rho !== null && Math.abs(rho) >= RISK_ENVELOPE.CORRELATION_THRESHOLD) correlated.push(l.sym.symbol);
      }
      const blocks = checkNewEntry(
        {
          equity,
          peak_equity: peak,
          realized_r_today: rByDay.get(day) ?? 0,
          realized_r_week: rByWeek.get(weekStartIso(new Date(t))) ?? 0,
          kill_switch_active: false,
          entries_paused: false,
          positions: live.map((l) => ({ symbol: l.sym.symbol, notional: l.pos.entry_limit * l.pos.size, open_risk_r: openRiskR(l.pos) })),
        },
        prep.sym.symbol,
        correlated
      );
      if (blocks.length) {
        blocks.forEach(block);
        continue;
      }
      const stopDistance = stopDistanceFor(res.snapshot.close, res.snapshot.atr, res.snapshot.swing_low, params);
      const plan = buildTradePlan({ entry: res.snapshot.close, stopDistance, equity, assetClass: prep.sym.asset_class, riskScale: 1 });
      if (!plan) {
        block("SIZE_ZERO");
        continue;
      }
      const metrics = di >= 20 ? screenMetricsAt(prep.sym.daily, di) : null;
      const pos = newPendingPosition({
        asset_class: prep.sym.asset_class,
        entry: plan.entry,
        stop: plan.stop,
        size: plan.size,
        use_partial: variant !== "NO_PARTIAL",
      });
      pos.exit_plan = variant === "NO_PARTIAL" ? null : exitPlan;
      live.push({
        pos,
        sym: prep.sym,
        trigger_at: t,
        bucket: metrics ? bucketId(prep.sym.asset_class, metrics) : `${prep.sym.asset_class}:UNKNOWN`,
      });
    }
  }

  // Close anything still open at the last bar so every trade is accounted for.
  for (const l of live) {
    const last = l.sym.entry.filter((b) => b.t <= input.end).at(-1);
    if (last) {
      forceClose(l.pos, last.c, "MANUAL", last.t);
      if (l.pos.state === "CLOSED" || l.pos.state === "CANCELLED") settle(l);
    }
  }

  const rTrades = trades.map((tr) => ({ r: tr.r, closed_at: tr.closed_at, reached_1r: tr.reached_1r, exit_reason: tr.exit_reason }));
  const stats = computeStats(rTrades);
  const avgRisk =
    input.symbols.length > 0
      ? input.symbols.reduce((s, x) => s + RISK_ENVELOPE.MAX_RISK_PER_TRADE[x.asset_class], 0) / input.symbols.length
      : 0.01;
  return {
    variant,
    stats,
    trades,
    equity_curve: downsample(equityCurve, 400),
    r_curve: equityCurveR(rTrades),
    r_distribution: rDistribution(rTrades),
    monte_carlo: monteCarlo(rTrades.map((x) => x.r), avgRisk),
    final_equity: cash,
    return_pct: cash / input.starting_equity - 1,
    max_equity_dd_pct: maxDdPct,
    benchmark_return_pct: benchmarkReturn(input),
    triggers,
    blocked,
    cancelled,
    kill_switch_tripped_at: killAt,
  };
}

/** Equal-weight buy & hold of the regime references present in the universe (BTC and/or SPY). */
export function benchmarkReturn(input: Pick<BacktestInput, "symbols" | "market" | "start" | "end">): number | null {
  const refs: Bar[][] = [];
  const hasCrypto = input.symbols.some((s) => s.asset_class !== "STOCK");
  const hasStock = input.symbols.some((s) => s.asset_class === "STOCK");
  if (hasCrypto && input.market.CRYPTO_ALT) refs.push(input.market.CRYPTO_ALT);
  if (hasStock && input.market.STOCK) refs.push(input.market.STOCK);
  const rets = refs
    .map((bars) => {
      const inRange = bars.filter((b) => b.t >= input.start && b.t <= input.end);
      if (inRange.length < 2) return null;
      return inRange[inRange.length - 1].c / inRange[0].o - 1;
    })
    .filter((x): x is number => x !== null);
  if (!rets.length) return null;
  return rets.reduce((s, r) => s + r, 0) / rets.length;
}

export function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

/** Regime-flip helper for the live engine: did the latest closed daily bar close below its EMA200? */
export function dailyBelowEma200(daily: Bar[]): boolean {
  const e = ema(daily.map((b) => b.c), 200);
  const last = daily.length - 1;
  return last >= 0 && Number.isFinite(e[last]) && daily[last].c < e[last];
}
