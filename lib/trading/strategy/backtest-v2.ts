import { RISK_ENVELOPE } from "../config";
import { returnCorrelation } from "../indicators";
import { computeStats, equityCurveR, groupStats, monteCarlo, rDistribution, type GroupStat } from "../metrics";
import { forceClose, newPendingPosition, openRiskR, realizedR, stepPosition, type SimPosition } from "../position";
import { checkNewEntry, shouldTripKillSwitch, weekStartIso } from "../risk-envelope";
import { buildTradePlan } from "../sizing";
import type { MonteCarloResult, PerformanceStats } from "../metrics";
import type { AssetClass } from "../types";
import type { CalendarEvent } from "../veto";
import { evaluateCandidates, extensionDecision, universeContext, type Candidate, type StrategyV2Params, type SymbolFrames } from "./candidates";
import { closedIdx } from "./series";

/**
 * Portfolio backtest for strategy v2. Timeline = hourly closes: positions are managed on 1h bars
 * (finer intra-trade resolution than v1), setups scanned on 4h closes, context from daily.
 */

const H1 = 3_600_000;

export type V2Trade = {
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
  setup: string;
  score: number;
  planned_rr: number;
  target_extensions: number;
};

export type V2Result = {
  variant: string;
  stats: PerformanceStats;
  trades: V2Trade[];
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
  by_setup: GroupStat[];
  by_score: GroupStat[];
  sharpe: number | null;
  benchmark_sharpe: number | null;
  benchmark_max_dd_pct: number | null;
  exposure_pct: number;
};

type Live = { pos: SimPosition; f: SymbolFrames; cand: Candidate; pending: { raise_target_to?: number; raise_stop_to?: number } };

function dailySharpe(curve: { t: number; equity: number }[]) {
  const byDay = new Map<number, number>();
  for (const p of curve) byDay.set(Math.floor(p.t / 86_400_000), p.equity);
  const eq = [...byDay.values()];
  const r: number[] = [];
  for (let i = 1; i < eq.length; i++) r.push(eq[i] / eq[i - 1] - 1);
  if (r.length < 30) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  return sd > 0 ? Math.round((m / sd) * Math.sqrt(365) * 100) / 100 : null;
}

export function runBacktestV2(input: {
  frames: SymbolFrames[];
  reference: Partial<Record<AssetClass, SymbolFrames>>;
  params: StrategyV2Params;
  starting_equity: number;
  start: number;
  end: number;
  calendar?: CalendarEvent[];
  label?: string;
}): V2Result {
  const { frames, params: p } = input;
  const h1Idx = new Map(frames.map((f) => [f.symbol, new Map(f.h1.bars.map((b, i) => [b.t + H1, i]))]));
  const times = [...new Set(frames.flatMap((f) => f.h1.bars.map((b) => b.t + H1)))].filter((t) => t >= input.start && t <= input.end).sort((a, b) => a - b);
  const macroDays = new Set((input.calendar ?? []).filter((e) => e.kind === "CPI" || e.kind === "FOMC").map((e) => e.date));

  let cash = input.starting_equity;
  let peak = cash;
  let killAt: number | null = null;
  let maxDd = 0;
  let exposedSteps = 0;
  const live: Live[] = [];
  const trades: V2Trade[] = [];
  const curve: { t: number; equity: number }[] = [];
  const blocked: Record<string, number> = {};
  const cancelled: Record<string, number> = {};
  const rByDay = new Map<string, number>();
  const rByWeek = new Map<string, number>();
  let triggers = 0;
  let ctxCache: { day: number; value: ReturnType<typeof universeContext> } | null = null;

  const settle = (l: Live) => {
    const pos = l.pos;
    if (pos.state === "CANCELLED") {
      cancelled[pos.cancel_reason ?? "?"] = (cancelled[pos.cancel_reason ?? "?"] ?? 0) + 1;
      return;
    }
    cash += pos.cash_flow;
    const r = realizedR(pos);
    const at = pos.closed_at ?? 0;
    const day = new Date(at).toISOString().slice(0, 10);
    rByDay.set(day, (rByDay.get(day) ?? 0) + r);
    const wk = weekStartIso(new Date(at));
    rByWeek.set(wk, (rByWeek.get(wk) ?? 0) + r);
    trades.push({
      symbol: l.f.symbol,
      asset_class: l.f.asset_class,
      bucket_id: `${l.f.asset_class}:${l.cand.setup}`,
      trigger_at: l.cand.t,
      opened_at: pos.opened_at ?? l.cand.t,
      closed_at: at,
      entry_price: pos.entry_price ?? pos.entry_limit,
      stop_price: (pos.entry_price ?? pos.entry_limit) - pos.stop_distance,
      target_price: pos.target_price,
      exit_price: pos.exit_price ?? 0,
      exit_reason: pos.exit_reason ?? "?",
      size: pos.initial_size,
      risk_amount: pos.initial_size * pos.stop_distance,
      reached_1r: pos.reached_1r,
      gapped_through_stop: pos.gapped_through_stop,
      r,
      fees_paid: pos.fees_paid,
      mfe_r: pos.mfe_r,
      mae_r: pos.mae_r,
      bars_held: pos.bars_held,
      setup: l.cand.setup,
      score: l.cand.score,
      planned_rr: l.cand.rr,
      target_extensions: pos.target_extensions ?? 0,
    });
  };

  for (const T of times) {
    // 1) Manage open positions on the hourly bar that closed at T.
    for (let k = live.length - 1; k >= 0; k--) {
      const l = live[k];
      const i = h1Idx.get(l.f.symbol)!.get(T);
      if (i === undefined) continue;
      const bar = l.f.h1.bars[i];
      const i4 = closedIdx(l.f.h4, T - H1);
      const id = closedIdx(l.f.d1, T);
      const dailyJustClosed = id >= 0 && l.f.d1.bars[id].t + 86_400_000 === T;
      stepPosition(l.pos, bar, {
        atr: i4 >= 0 ? l.f.h4.atr[i4] : NaN,
        regime_flip: dailyJustClosed && l.f.d1.bars[id].c < l.f.d1.ema200[id],
        raise_target_to: l.pending.raise_target_to,
        raise_stop_to: l.pending.raise_stop_to,
      });
      l.pending = {};
      if (l.pos.state === "CLOSED" || l.pos.state === "CANCELLED") {
        settle(l);
        live.splice(k, 1);
        continue;
      }
      // Decide at this close whether conditions matured enough to extend the target for the next bar.
      if (p.extension_enabled && l.pos.entry_price !== null) {
        const ext = extensionDecision({ f: l.f, t: T, entry: l.pos.entry_price, stop: l.pos.stop_price, target: l.pos.target_price, stopDistance: l.pos.stop_distance, lastClose: bar.c });
        if (ext) l.pending = { raise_target_to: ext.raise_target_to, raise_stop_to: ext.raise_stop_to };
      }
    }

    // 2) Mark to market + kill switch.
    let mtm = 0;
    for (const l of live) {
      if (l.pos.entry_price === null) continue;
      const i1 = closedIdx(l.f.h1, T);
      mtm += l.pos.cash_flow + (i1 >= 0 ? l.f.h1.bars[i1].c : l.pos.entry_price) * l.pos.size;
    }
    const equity = cash + mtm;
    if (live.some((l) => l.pos.entry_price !== null)) exposedSteps += 1;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
    curve.push({ t: T, equity });
    if (killAt === null && shouldTripKillSwitch(equity, peak)) {
      killAt = T;
      for (const l of live) {
        const i1 = closedIdx(l.f.h1, T);
        forceClose(l.pos, i1 >= 0 ? l.f.h1.bars[i1].c : (l.pos.entry_price ?? l.pos.entry_limit), "KILL_SWITCH", T);
        settle(l);
      }
      live.length = 0;
    }
    if (killAt !== null) continue;

    // 3) Scan on 4h closes.
    if (T % (4 * H1) !== 0) continue;
    const day = Math.floor(T / 86_400_000);
    if (!ctxCache || ctxCache.day !== day) ctxCache = { day, value: universeContext(frames, T) };
    const uctx = ctxCache.value;
    const cands: { f: SymbolFrames; c: Candidate }[] = [];
    for (const f of frames) {
      const ref = input.reference[f.asset_class];
      let referenceOk: boolean | null = null;
      if (ref && ref.symbol !== f.symbol && f.asset_class !== "CRYPTO_MAJOR") {
        const ri = closedIdx(ref.d1, T);
        referenceOk = ri >= 0 ? ref.d1.bars[ri].c > ref.d1.ema200[ri] : false;
      }
      const res = evaluateCandidates(f, T, { reference_ok: referenceOk, rs_rank: uctx.rank.get(f.symbol) ?? null, breadth: uctx.breadth }, p);
      for (const c of res.candidates) cands.push({ f, c });
    }
    if (!cands.length) continue;
    triggers += cands.length;
    // Limited capacity → best confluence first.
    cands.sort((a, b) => b.c.score - a.c.score || b.c.rr - a.c.rr);
    const dayIso = new Date(T).toISOString().slice(0, 10);
    const taken = new Set<string>();
    for (const { f, c } of cands) {
      const block = (code: string) => (blocked[code] = (blocked[code] ?? 0) + 1);
      if (taken.has(f.symbol)) continue;
      if (macroDays.has(dayIso)) {
        block("MACRO_EVENT_DAY");
        continue;
      }
      const di = closedIdx(f.d1, T);
      const correlated: string[] = [];
      for (const l of live) {
        const oi = closedIdx(l.f.d1, T);
        if (di < 61 || oi < 61) continue;
        const rho = returnCorrelation(f.d1.bars.slice(di - 60, di + 1).map((b) => b.c), l.f.d1.bars.slice(oi - 60, oi + 1).map((b) => b.c));
        if (rho !== null && Math.abs(rho) >= RISK_ENVELOPE.CORRELATION_THRESHOLD) correlated.push(l.f.symbol);
      }
      const blocks = checkNewEntry(
        {
          equity,
          peak_equity: peak,
          realized_r_today: rByDay.get(dayIso) ?? 0,
          realized_r_week: rByWeek.get(weekStartIso(new Date(T))) ?? 0,
          kill_switch_active: false,
          entries_paused: false,
          positions: live.map((l) => ({ symbol: l.f.symbol, notional: l.pos.entry_limit * l.pos.size, open_risk_r: openRiskR(l.pos) })),
        },
        f.symbol,
        correlated
      );
      if (blocks.length) {
        blocks.forEach(block);
        continue;
      }
      const plan = buildTradePlan({ entry: c.entry, stopDistance: c.entry - c.stop, equity, assetClass: f.asset_class, riskScale: 1 });
      if (!plan) {
        block("SIZE_ZERO");
        continue;
      }
      const pos = newPendingPosition({ asset_class: f.asset_class, entry: plan.entry, stop: plan.stop, size: plan.size });
      pos.exit_plan = "STRUCTURAL";
      pos.target_price = c.target;
      pos.initial_target_price = c.target;
      pos.partial_fraction = p.partial_fraction;
      pos.breakeven_at_r = p.breakeven_at_r;
      pos.trail_after_r = p.trail_after_r;
      pos.trail_mult = p.trail_mult_atr4h;
      live.push({ pos, f, cand: c, pending: {} });
      taken.add(f.symbol);
    }
  }

  for (const l of live) {
    const i1 = closedIdx(l.f.h1, input.end);
    if (i1 >= 0) {
      forceClose(l.pos, l.f.h1.bars[i1].c, "MANUAL", input.end);
      settle(l);
    }
  }

  const rt = trades.map((x) => ({ ...x, closed_at: x.closed_at }));
  const avgRisk = frames.length ? frames.reduce((s, f) => s + RISK_ENVELOPE.MAX_RISK_PER_TRADE[f.asset_class], 0) / frames.length : 0.01;
  const bench = benchmark(input);
  return {
    variant: input.label ?? p.version,
    stats: computeStats(rt),
    trades,
    equity_curve: downsample(curve, 500),
    r_curve: equityCurveR(rt),
    r_distribution: rDistribution(rt),
    monte_carlo: monteCarlo(rt.map((x) => x.r), avgRisk),
    final_equity: cash,
    return_pct: cash / input.starting_equity - 1,
    max_equity_dd_pct: maxDd,
    benchmark_return_pct: bench.ret,
    benchmark_sharpe: bench.sharpe,
    benchmark_max_dd_pct: bench.dd,
    sharpe: dailySharpe(curve),
    exposure_pct: times.length ? exposedSteps / times.length : 0,
    triggers,
    blocked,
    cancelled,
    kill_switch_tripped_at: killAt,
    by_setup: groupStats(rt, (x) => x.setup),
    by_score: groupStats(rt, (x) => (x.score >= 70 ? "70+" : x.score >= 60 ? "60-69" : "50-59")),
  };
}

export function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

/** Equal-weight buy & hold of every symbol in the run (return, daily Sharpe, max drawdown). */
function benchmark(input: { frames: SymbolFrames[]; start: number; end: number }) {
  const days = new Map<number, number[]>();
  for (const f of input.frames) {
    const bars = f.d1.bars.filter((b) => b.t >= input.start && b.t + 86_400_000 <= input.end);
    for (let i = 1; i < bars.length; i++) {
      const d = Math.floor(bars[i].t / 86_400_000);
      days.set(d, [...(days.get(d) ?? []), bars[i].c / bars[i - 1].c - 1]);
    }
  }
  const r = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([, xs]) => xs.reduce((a, b) => a + b, 0) / xs.length);
  if (r.length < 30) return { ret: null, sharpe: null, dd: null };
  let eq = 1;
  let pk = 1;
  let dd = 0;
  for (const x of r) {
    eq *= 1 + x;
    pk = Math.max(pk, eq);
    dd = Math.max(dd, 1 - eq / pk);
  }
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  return { ret: eq - 1, sharpe: sd > 0 ? Math.round((m / sd) * Math.sqrt(365) * 100) / 100 : null, dd };
}
