import { getSupabase } from "@/lib/supabase";
import { REGIME_REFERENCE, RISK_ENVELOPE, isCrypto } from "./config";
import { consolidatePlaybook, judgeTrigger, reviewClosedTrade, reviewExtension, type AgentVerdict, type ExperienceCard } from "./agent-judge";
import { returnCorrelation } from "./indicators";
import { evaluateEligibility } from "./learning";
import { createBarCache, fetchBidAskSpreadPct, fetchBtcDominance, fetchEarningsSymbols, fetchFundingRate, fetchVix, lookbackForClass, type BarCache } from "./market-data";
import { computeStats } from "./metrics";
import { forceClose, newPendingPosition, openRiskR, realizedR, stepPosition, type PositionEvent, type SimPosition } from "./position";
import { checkNewEntry, drawdownFromPeak, shouldTripKillSwitch, weekStartIso } from "./risk-envelope";
import { buildTradePlan } from "./sizing";
import {
  activatePlaybook,
  countLessonsSince,
  ensureSeeded,
  getActivePlaybook,
  getActiveV2Params,
  getCalendar,
  getClosedTrades,
  getOpenTrades,
  getSettings,
  getUniverse,
  insertLesson,
  isAccountTrade,
  listLessons,
  logEvent,
  simColumns,
  toJournalTrade,
  updateSettings,
  updateTrade,
  type PlaybookRow,
  type TradeRow,
  type TradingSettings,
  type UniverseRow,
} from "./store";
import { analystBrief, evaluateCandidates, extensionDecision, lastBars, universeContext, type Candidate, type StrategyV2Params, type SymbolFrames } from "./strategy/candidates";
import { framesFromBars } from "./strategy/data-v2";
import { closedIdx } from "./strategy/series";
import { bucketId, screenFailures, screenMetricsAt } from "./universe";
import { evaluateVetoes, isoDateInZone, mustExitBeforeEarnings, nextTradingDays, type CalendarEvent } from "./veto";
import type { Bar, UniverseSymbol } from "./types";

/**
 * מערכת המסחר — live pipeline, run every 15 minutes (GitHub Actions → /api/trading/tick).
 * Strategy v2: context on daily, setups on 4h closes, entry timing + position management on 1h bars.
 * Idempotent: triggers are unique per (symbol, mode, bar) and positions only advance over unseen bars.
 */

const H1 = 3_600_000;
const H4 = 4 * H1;
const D1 = 24 * H1;
const TICK_TIME_BUDGET_MS = 240_000;
const MAX_AGENT_CALLS_PER_TICK = 10;
const MAX_LESSONS_PER_TICK = 3;
const LESSONS_PER_PLAYBOOK = 8;
const CHART_BARS_BEFORE = 120;
const CHART_BARS_MAX = 400;
export const STRATEGY_VERSION = "v2";

type TickSummary = {
  phase: string;
  positions_updated: number;
  closed: number;
  triggers: number;
  entries: number;
  vetoed: number;
  blocked: number;
  agent_calls: number;
  lessons: number;
  extensions: number;
  playbook_version: number | null;
  screened: boolean;
  errors: string[];
  skipped_reason?: string;
  duration_ms?: number;
};

const iso = (ms: number) => new Date(ms).toISOString();
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

function toSym(u: Pick<UniverseRow, "symbol" | "asset_class" | "provider_symbol">): UniverseSymbol {
  return { symbol: u.symbol, asset_class: u.asset_class, provider_symbol: u.provider_symbol };
}

function barsFor(cache: BarCache, sym: UniverseSymbol, tf: "1h" | "1d") {
  return cache.get(sym, tf, lookbackForClass(sym.asset_class, tf));
}

/** Per-tick memo of multi-timeframe frames. */
function createFrameCache(cache: BarCache) {
  const memo = new Map<string, Promise<SymbolFrames | null>>();
  return (sym: UniverseSymbol) => {
    let p = memo.get(sym.symbol);
    if (!p) {
      p = Promise.all([barsFor(cache, sym, "1h"), barsFor(cache, sym, "1d")]).then(([h1, d1]) => (h1.length > 300 && d1.length > 220 ? framesFromBars(sym, h1, d1) : null));
      memo.set(sym.symbol, p);
    }
    return p;
  };
}
type FrameCache = ReturnType<typeof createFrameCache>;

// ── Account ─────────────────────────────────────────────────────────────────

type Account = { equity: number; realizedToday: number; realizedWeek: number; open: TradeRow[] };

function markToMarket(t: TradeRow, lastPrice: number | undefined) {
  const p = t.sim_state;
  if (p.entry_price === null) return 0;
  return p.cash_flow + (lastPrice ?? p.entry_price) * p.size;
}

async function loadAccount(settings: TradingSettings, openTrades: TradeRow[], lastPrices: Map<string, number>, now: number): Promise<Account> {
  const closed = (await getClosedTrades()).filter((t) => isAccountTrade(t, settings.phase));
  const inPhase = closed.filter((t) => t.closed_at && Date.parse(t.closed_at) >= Date.parse(settings.phase_started_at));
  const today = new Date(now).toISOString().slice(0, 10);
  const week = weekStartIso(new Date(now));
  const open = openTrades.filter((t) => isAccountTrade(t, settings.phase));
  return {
    equity: settings.starting_equity + inPhase.reduce((s, t) => s + (t.realized_pnl ?? 0), 0) + open.reduce((s, t) => s + markToMarket(t, lastPrices.get(t.symbol)), 0),
    realizedToday: inPhase.filter((t) => t.closed_at!.slice(0, 10) === today).reduce((s, t) => s + (t.realized_r ?? 0), 0),
    realizedWeek: inPhase.filter((t) => weekStartIso(new Date(t.closed_at!)) === week).reduce((s, t) => s + (t.realized_r ?? 0), 0),
    open,
  };
}

// ── 1. Manage open positions on 1h bars ────────────────────────────────────

function mergeChartBars(existing: Bar[], add: Bar[]): Bar[] {
  const map = new Map(existing.map((b) => [b.t, b]));
  for (const b of add) map.set(b.t, b);
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-CHART_BARS_MAX);
}

type SimWithReview = SimPosition & { extension_declined_target?: number };

async function advancePositions(input: {
  trades: TradeRow[];
  frames: FrameCache;
  universe: Map<string, UniverseRow>;
  params: StrategyV2Params;
  calendar: CalendarEvent[];
  earningsNext: Set<string> | null;
  agentEnabled: boolean;
  now: number;
  summary: TickSummary;
  lastPrices: Map<string, number>;
}) {
  const bySymbol = new Map<string, TradeRow[]>();
  for (const t of input.trades) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);

  for (const [symbol, trades] of bySymbol) {
    const u = input.universe.get(symbol);
    if (!u) continue;
    const sym = toSym(u);
    try {
      const f = await input.frames(sym);
      if (!f) continue;
      const h1 = f.h1.bars;
      input.lastPrices.set(symbol, h1[h1.length - 1].c);
      const earningsExit = sym.asset_class === "STOCK" && mustExitBeforeEarnings(symbol, new Date(input.now), input.calendar, input.earningsNext);

      for (const trade of trades) {
        const p: SimWithReview = { ...trade.sim_state };
        // trigger_timestamp is the 4h close; the first manageable hourly bar is the one that opens at it.
        const from = trade.last_bar_time ? Date.parse(trade.last_bar_time) : Date.parse(trade.trigger_timestamp) - 1;
        const freshIdx: number[] = [];
        for (let i = 0; i < h1.length; i++) if (h1[i].t > from) freshIdx.push(i);
        if (!freshIdx.length) continue;
        const events: TradeRow["events"] = [...(trade.events ?? [])];

        for (const i of freshIdx) {
          const bar = h1[i];
          const closeT = bar.t + H1;
          let raise: { raise_target_to?: number; raise_stop_to?: number } = {};
          // TP extension is decided from the PREVIOUS close (bar.t) and applied to this bar.
          if (input.params.extension_enabled && p.entry_price !== null && i > 0 && p.state !== "PENDING") {
            const ext = extensionDecision({ f, t: bar.t, entry: p.entry_price, stop: p.stop_price, target: p.target_price, stopDistance: p.stop_distance, lastClose: h1[i - 1].c });
            if (ext && p.extension_declined_target !== p.target_price) {
              let approved = true;
              let why = ext.reason;
              const isLatest = i === freshIdx[freshIdx.length - 1];
              if (trade.track === "AGENT" && input.agentEnabled && isLatest && input.summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
                input.summary.agent_calls += 1;
                const review = await reviewExtension({
                  symbol,
                  brief: analystBrief(f, bar.t),
                  bars: h1.slice(Math.max(0, i - 48), i),
                  entry: p.entry_price,
                  stop: p.stop_price,
                  target: p.target_price,
                  proposed_target: ext.raise_target_to,
                  proposed_stop: ext.raise_stop_to,
                  current_r: (h1[i - 1].c - p.entry_price) / p.stop_distance,
                });
                approved = review.approve;
                why = `${ext.reason} · agent: ${review.reasoning}`;
              }
              if (approved) {
                raise = ext;
                input.summary.extensions += 1;
                events.push({ type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: bar.t, note: `TP extension: ${why}` });
              } else {
                p.extension_declined_target = p.target_price;
                events.push({ type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: bar.t, note: `TP extension declined: ${why}` });
              }
            }
          }
          const id = closedIdx(f.d1, closeT);
          const dailyJustClosed = id >= 0 && f.d1.bars[id].t + D1 === closeT;
          const i4 = closedIdx(f.h4, bar.t);
          const ev = stepPosition(p, bar, {
            atr: i4 >= 0 ? f.h4.atr[i4] : NaN,
            regime_flip: dailyJustClosed && f.d1.bars[id].c < f.d1.ema200[id],
            force_exit_reason: i === h1.length - 1 && earningsExit ? "EARNINGS" : undefined,
            ...raise,
          });
          events.push(...ev);
          if (p.state === "CLOSED" || p.state === "CANCELLED") break;
        }

        const lastSeen = h1[freshIdx[freshIdx.length - 1]].t;
        const closedNow = p.state === "CLOSED";
        await updateTrade(trade.id, {
          ...simColumns(p),
          events,
          last_bar_time: iso(lastSeen),
          chart_bars: mergeChartBars(trade.chart_bars ?? [], h1.filter((b) => b.t > from && b.t <= (p.closed_at ?? lastSeen))),
          ...(closedNow ? { realized_r: round(realizedR(p), 3), realized_pnl: round(p.cash_flow, 2) } : {}),
        });
        input.summary.positions_updated += 1;
        if ((closedNow || p.state === "CANCELLED") && trade.track === "AGENT") {
          input.summary.closed += 1;
          const r = realizedR(p);
          await logEvent({
            kind: p.state === "CANCELLED" ? "ORDER_CANCELLED" : "TRADE_CLOSED",
            symbol,
            message: p.state === "CANCELLED" ? `${symbol}: פקודת כניסה בוטלה (${p.cancel_reason})` : `${symbol}: נסגרה ${p.exit_reason} · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R`,
            data: { trade_id: trade.id },
            push: closedNow && trade.execution !== "SHADOW",
          });
        }
        trade.sim_state = p;
        trade.state = p.state;
        if (closedNow) {
          trade.realized_r = round(realizedR(p), 3);
          trade.chart_bars = mergeChartBars(trade.chart_bars ?? [], h1.filter((b) => b.t > from && b.t <= (p.closed_at ?? lastSeen)));
          trade.events = events;
        }
      }
    } catch (err) {
      input.summary.errors.push(`advance ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ── 2. Self-learning: post-trade lessons → playbook ────────────────────────

async function learnFromClosedTrades(closedNow: TradeRow[], summary: TickSummary) {
  for (const t of closedNow.filter((x) => x.track === "AGENT" && x.state === "CLOSED" && !x.lesson_id).slice(0, MAX_LESSONS_PER_TICK)) {
    const { data: trig } = t.trigger_id ? await getSupabase().from("trading_triggers").select("agent_market_read, agent_thesis, agent_invalidation, agent_reasoning, score, setup").eq("id", t.trigger_id).maybeSingle() : { data: null };
    summary.agent_calls += 1;
    const lesson = await reviewClosedTrade({
      trade: {
        symbol: t.symbol,
        setup: t.setup,
        score: t.score,
        entry: t.entry_price,
        initial_stop: t.initial_stop_price,
        final_target: t.target_price,
        exit: t.exit_price,
        exit_reason: t.exit_reason,
        realized_r: t.realized_r,
        mfe_r: t.sim_state.mfe_r,
        mae_r: t.sim_state.mae_r,
        risk_multiplier: t.agent_risk_multiplier,
        analysis_at_entry: trig,
        lifecycle: t.events,
      },
      path_bars: t.chart_bars ?? [],
    });
    if (!lesson) continue;
    const pb = await getActivePlaybook();
    const lessonId = await insertLesson({ trade_id: t.id, symbol: t.symbol, setup: t.setup, realized_r: t.realized_r ?? 0, playbook_version: pb?.version ?? null, ...lesson });
    if (lessonId) {
      await updateTrade(t.id, { lesson_id: lessonId });
      summary.lessons += 1;
    }
  }

  const active = await getActivePlaybook();
  if ((await countLessonsSince(active?.created_at ?? null)) < LESSONS_PER_PLAYBOOK) return;
  const lessons = (await listLessons(60)).map((l) => ({ category: l.category as never, what_happened: l.what_happened, lesson: l.lesson, applies_when: l.applies_when, decision_quality: l.decision_quality, realized_r: l.realized_r }));
  summary.agent_calls += 1;
  const rules = await consolidatePlaybook(lessons);
  if (!rules?.length) return;
  const version = await activatePlaybook(rules, lessons.length);
  summary.playbook_version = version;
  await logEvent({ kind: "PLAYBOOK", severity: "warn", message: `הסוכן מסחר עדכן playbook לגרסה ${version}: ${rules.length} כללים מ-${lessons.length} לקחים`, push: true });
}

// ── 3. Daily screen + eligibility gate ─────────────────────────────────────

async function dailyScreen(universe: UniverseRow[], cache: BarCache, now: number, summary: TickSummary) {
  const sb = getSupabase();
  for (const u of universe) {
    const sym = toSym(u);
    try {
      const daily = await barsFor(cache, sym, "1d");
      const spread = isCrypto(sym.asset_class) ? await fetchBidAskSpreadPct(sym.provider_symbol) : null;
      const m = screenMetricsAt(daily, daily.length - 1, spread);
      if (!m) continue;
      // Typical stop ≈ 1.5 × daily ATR — the spread must be tiny relative to it.
      const failures = screenFailures(m, sym.asset_class, 1.5 * m.atr_pct);
      await sb
        .from("trading_universe")
        .update({ screen_passed: failures.length === 0, screen_failures: failures, bucket_id: bucketId(sym.asset_class, m), metrics: m, last_screened_at: iso(now), updated_at: iso(now) })
        .eq("symbol", u.symbol);
      u.screen_passed = failures.length === 0;
      u.bucket_id = bucketId(sym.asset_class, m);
    } catch (err) {
      summary.errors.push(`screen ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const decisions = evaluateEligibility({
    universe: universe.map((u) => ({ symbol: u.symbol, bucket_id: u.bucket_id, eligibility: u.eligibility, eligibility_changed_at: u.eligibility_changed_at ? Date.parse(u.eligibility_changed_at) : null })),
    trades: (await getClosedTrades()).map(toJournalTrade),
    now,
  });
  for (const d of decisions) {
    await sb.from("trading_universe").update({ eligibility: d.to, eligibility_changed_at: iso(now), eligibility_note: d.reason, updated_at: iso(now) }).eq("symbol", d.symbol);
    const u = universe.find((x) => x.symbol === d.symbol);
    if (u) {
      u.eligibility = d.to;
      u.eligibility_changed_at = iso(now);
    }
    await logEvent({ kind: "ELIGIBILITY", symbol: d.symbol, severity: "warn", message: `${d.symbol}: ${d.from} → ${d.to} (${d.reason})`, push: true });
  }
}

// ── 4. Scan (4h closes) ────────────────────────────────────────────────────

function experienceCard(symbol: string, c: Candidate, closed: TradeRow[]): ExperienceCard {
  const det = closed.filter((t) => t.track === "DETERMINISTIC");
  const mine = det.filter((t) => t.symbol === symbol);
  const band = (s: number | null) => (s === null ? "?" : s >= 70 ? "70+" : s >= 60 ? "60" : "<60");
  const similar = det.filter((t) => t.setup === c.setup && band(t.score) === band(c.score) && t.asset_class === c.asset_class);
  const stat = (list: TradeRow[]) => computeStats(list.map((t) => ({ r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at ?? t.created_at) })));
  const s = stat(mine);
  const sim = stat(similar);
  const slips = mine.map((t) => t.entry_slippage_bps).filter((x): x is number => x !== null);
  return {
    symbol_trades: s.trades,
    symbol_expectancy_r: s.trades ? s.expectancy_r : null,
    similar_setup_trades: sim.trades,
    similar_setup_expectancy_r: sim.trades ? sim.expectancy_r : null,
    similar_setup_win_rate: sim.trades ? sim.win_rate : null,
    avg_slippage_bps: slips.length ? Math.round(slips.reduce((x, y) => x + y, 0) / slips.length) : null,
  };
}

async function insertTrade(t: {
  trigger_id: string;
  c: Candidate;
  bucket: string;
  track: "DETERMINISTIC" | "AGENT";
  execution: "SHADOW" | "PAPER";
  snapshot: Record<string, unknown>;
  plan: { entry: number; stop: number; size: number; risk_amount: number };
  target: number;
  verdict: AgentVerdict | null;
  params: StrategyV2Params;
  chart: Bar[];
}) {
  const p = newPendingPosition({ asset_class: t.c.asset_class, entry: t.plan.entry, stop: t.plan.stop, size: t.plan.size });
  p.exit_plan = "STRUCTURAL";
  p.target_price = t.target;
  p.initial_target_price = t.target;
  p.breakeven_at_r = t.params.breakeven_at_r;
  p.partial_fraction = t.params.partial_fraction;
  p.trail_after_r = t.params.trail_after_r;
  p.trail_mult = t.params.trail_mult_atr4h;
  const { error } = await getSupabase()
    .from("trading_trades")
    .insert({
      trigger_id: t.trigger_id,
      symbol: t.c.symbol,
      asset_class: t.c.asset_class,
      bucket_id: t.bucket,
      mode: "SWING",
      track: t.track,
      execution: t.execution,
      trigger_timestamp: iso(t.c.t),
      trigger_snapshot: t.snapshot,
      agent_decision: t.verdict?.decision ?? "ENTER",
      agent_conviction: t.verdict?.conviction ?? null,
      agent_risk_multiplier: t.verdict?.risk_multiplier ?? 1,
      agent_reasoning: t.verdict?.primary_reasoning ?? null,
      agent_model_version: t.verdict?.model_version ?? "agent-disabled",
      prompt_version: t.verdict?.prompt_version ?? "none",
      param_version: t.params.version,
      strategy_version: STRATEGY_VERSION,
      setup: t.c.setup,
      score: t.c.score,
      entry_limit: t.plan.entry,
      initial_stop_price: t.plan.stop,
      position_size: t.plan.size,
      risk_amount: t.plan.risk_amount,
      chart_bars: t.chart,
      events: [],
      ...simColumns(p),
    });
  if (error) throw new Error(`insert trade: ${error.message}`);
}

async function scan(input: {
  settings: TradingSettings;
  universe: UniverseRow[];
  params: StrategyV2Params;
  frames: FrameCache;
  cache: BarCache;
  calendar: CalendarEvent[];
  account: Account;
  playbook: PlaybookRow | null;
  now: number;
  started: number;
  summary: TickSummary;
}) {
  const { settings, params, now, summary } = input;
  // Setups are only defined on a completed 4h bar.
  const T = Math.floor(now / H4) * H4;
  const eligible = input.universe.filter((u) => u.manual_enabled && u.screen_passed && u.eligibility !== "DISABLED_POOR");
  if (!eligible.length) return;

  const framesList: SymbolFrames[] = [];
  for (const u of eligible) {
    const f = await input.frames(toSym(u));
    if (f) framesList.push(f);
  }
  const refFrames = new Map<string, SymbolFrames | null>();
  for (const ref of new Set(eligible.map((u) => REGIME_REFERENCE[u.asset_class]))) refFrames.set(ref.symbol, await input.frames(ref));
  const byClass = (cls: "STOCK" | "CRYPTO") => framesList.filter((f) => (cls === "STOCK" ? f.asset_class === "STOCK" : f.asset_class !== "STOCK"));
  const ctxStock = universeContext(byClass("STOCK"), T);
  const ctxCrypto = universeContext(byClass("CRYPTO"), T);

  const found: Candidate[] = [];
  const referenceOkBySymbol = new Map<string, boolean | null>();
  for (const f of framesList) {
    const ref = refFrames.get(REGIME_REFERENCE[f.asset_class].symbol) ?? null;
    let referenceOk: boolean | null = null;
    if (ref && ref.symbol !== f.symbol && f.asset_class !== "CRYPTO_MAJOR") {
      const ri = closedIdx(ref.d1, T);
      referenceOk = ri >= 0 ? ref.d1.bars[ri].c > ref.d1.ema200[ri] : false;
    }
    referenceOkBySymbol.set(f.symbol, referenceOk);
    const uctx = f.asset_class === "STOCK" ? ctxStock : ctxCrypto;
    found.push(...evaluateCandidates(f, T, { reference_ok: referenceOk, rs_rank: uctx.rank.get(f.symbol) ?? null, breadth: uctx.breadth }, params).candidates);
  }
  if (!found.length) return;
  found.sort((a, b) => b.score - a.score || b.rr - a.rr);

  const closed = await getClosedTrades();
  const earnings = found.some((c) => c.asset_class === "STOCK") ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 4)) : new Set<string>();
  const [vix, dominance] = await Promise.all([fetchVix(), fetchBtcDominance()]);

  for (const c of found) {
    if (Date.now() - input.started > TICK_TIME_BUDGET_MS) {
      summary.errors.push("time_budget_exhausted");
      return;
    }
    const u = eligible.find((x) => x.symbol === c.symbol)!;
    const f = framesList.find((x) => x.symbol === c.symbol)!;
    const sym = toSym(u);
    try {
      summary.triggers += 1;
      const bucket = u.bucket_id ?? `${sym.asset_class}:UNKNOWN`;
      const funding = isCrypto(sym.asset_class) ? await fetchFundingRate(sym.provider_symbol) : undefined;
      const vetoes = evaluateVetoes({ symbol: sym.symbol, asset_class: sym.asset_class, mode: "SWING", now: new Date(now), calendar: input.calendar, earnings_symbols: earnings, funding_rate: funding });

      const correlated: string[] = [];
      const correlations: Record<string, number | null> = {};
      for (const t of input.account.open) {
        const other = input.universe.find((x) => x.symbol === t.symbol);
        if (!other) continue;
        const od = await barsFor(input.cache, toSym(other), "1d");
        const rho = returnCorrelation(f.d1.bars.map((b) => b.c), od.map((b) => b.c));
        correlations[t.symbol] = rho === null ? null : round(rho, 2);
        if (rho !== null && Math.abs(rho) >= RISK_ENVELOPE.CORRELATION_THRESHOLD) correlated.push(t.symbol);
      }
      const openRisk = input.account.open.map((t) => ({ symbol: t.symbol, notional: t.entry_limit * t.remaining_size, open_risk_r: openRiskR(t.sim_state) }));
      const blocks = checkNewEntry(
        {
          equity: input.account.equity,
          peak_equity: Math.max(settings.peak_equity, input.account.equity),
          realized_r_today: input.account.realizedToday,
          realized_r_week: input.account.realizedWeek,
          kill_switch_active: settings.kill_switch_active,
          entries_paused: settings.entries_paused,
          positions: openRisk,
        },
        sym.symbol,
        correlated
      );
      const basePlan = buildTradePlan({ entry: c.entry, stopDistance: c.entry - c.stop, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale });
      const deterministic = vetoes.length ? "VETO" : blocks.length || !basePlan ? "BLOCKED" : "ENTER";
      const brief = analystBrief(f, T);
      const snapshot = { candidate: c, brief, correlations, funding_rate: funding ?? null, vix, btc_dominance_pct: dominance };

      const { data: trig, error: trigErr } = await getSupabase()
        .from("trading_triggers")
        .upsert(
          {
            symbol: sym.symbol,
            asset_class: sym.asset_class,
            mode: "SWING",
            bucket_id: bucket,
            bar_time: iso(T - H4),
            setup: c.setup,
            score: c.score,
            snapshot,
            vetoes,
            envelope_blocks: blocks,
            plan: basePlan ? { ...basePlan, target: c.target, target_menu: c.target_menu } : null,
            deterministic_decision: deterministic,
            param_version: params.version,
            phase: settings.phase,
          },
          { onConflict: "symbol,mode,bar_time", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();
      if (trigErr) throw new Error(trigErr.message);
      if (!trig) continue; // already processed by an earlier tick
      const triggerId = String((trig as { id: string }).id);
      if (vetoes.length || !basePlan || !brief) {
        summary.vetoed += vetoes.length ? 1 : 0;
        continue;
      }

      // הסוכן מסחר — analyst judgement (also recorded when the envelope blocks, for shadow measurement).
      let verdict: AgentVerdict | null = null;
      let flags: string[] = [];
      if (settings.agent_enabled && summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
        summary.agent_calls += 1;
        const i1 = closedIdx(f.h1, T);
        const judged = await judgeTrigger(
          {
            symbol: sym.symbol,
            asset_class: sym.asset_class,
            candidate: c,
            target_menu: c.target_menu,
            brief,
            bars: { d1: lastBars(f.d1, closedIdx(f.d1, T), 30), h4: lastBars(f.h4, closedIdx(f.h4, T), 40), h1: lastBars(f.h1, i1, 48) },
            experience: experienceCard(sym.symbol, c, closed),
            portfolio: {
              open_positions: input.account.open.map((t) => ({ symbol: t.symbol, state: t.state, open_risk_r: openRiskR(t.sim_state), correlation: correlations[t.symbol] ?? null })),
              open_risk_r: openRisk.reduce((s, p) => s + p.open_risk_r, 0),
              realized_r_today: input.account.realizedToday,
              realized_r_week: input.account.realizedWeek,
              drawdown_pct: drawdownFromPeak(input.account.equity, settings.peak_equity),
            },
            market: { reference_ok: referenceOkBySymbol.get(c.symbol) ?? null, rs_rank: (c.factors.rs_rank as number | null) ?? null, breadth: (c.factors.breadth as number | null) ?? null, vix, btc_dominance_pct: dominance, funding_rate: funding ?? null, headlines: [] },
            playbook: input.playbook?.rules ?? [],
          },
          input.playbook?.version ?? null
        );
        verdict = judged.verdict;
        flags = judged.flags;
      }
      await getSupabase()
        .from("trading_triggers")
        .update({
          agent_decision: verdict?.decision ?? null,
          agent_conviction: verdict?.conviction ?? null,
          agent_risk_multiplier: verdict?.risk_multiplier ?? null,
          agent_reasoning: verdict?.primary_reasoning ?? null,
          agent_key_risks: verdict?.key_risks ?? null,
          agent_confidence: verdict?.confidence ?? null,
          agent_model_version: verdict?.model_version ?? null,
          prompt_version: verdict?.prompt_version ?? null,
          agent_error: verdict?.error ?? null,
          agent_market_read: verdict?.market_read ?? null,
          agent_thesis: verdict?.thesis ?? null,
          agent_invalidation: verdict?.invalidation ?? null,
          agent_target_index: verdict?.target_index ?? null,
          agent_lessons_applied: verdict?.lessons_applied ?? null,
          injection_flags: flags,
        })
        .eq("id", triggerId);
      if (flags.length) await logEvent({ kind: "INJECTION_FLAGGED", symbol: sym.symbol, severity: "warn", message: `${sym.symbol}: external text flagged (${flags.join(", ")})` });

      const chart = f.h1.bars.slice(Math.max(0, closedIdx(f.h1, T) - CHART_BARS_BEFORE + 1), closedIdx(f.h1, T) + 1);
      const base = { trigger_id: triggerId, c, bucket, snapshot: snapshot as unknown as Record<string, unknown>, verdict, params, chart };

      // Deterministic baseline — structural target, always simulated forward in shadow.
      await insertTrade({ ...base, track: "DETERMINISTIC", execution: "SHADOW", plan: basePlan, target: c.target });

      const multiplier = verdict ? verdict.risk_multiplier : 1;
      if (settings.phase === "BACKTEST" || multiplier === 0) continue;
      if (blocks.length) {
        summary.blocked += 1;
        continue;
      }
      const agentPlan = buildTradePlan({ entry: c.entry, stopDistance: c.entry - c.stop, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale * multiplier });
      if (!agentPlan) continue;
      const target = c.target_menu[verdict?.target_index ?? 0]?.price ?? c.target;
      const execution = settings.phase === "PAPER" && u.eligibility === "ACTIVE" ? "PAPER" : "SHADOW";
      await insertTrade({ ...base, track: "AGENT", execution, plan: agentPlan, target });
      summary.entries += 1;
      input.account.open.push({ symbol: sym.symbol, entry_limit: agentPlan.entry, remaining_size: agentPlan.size, state: "PENDING", sim_state: { state: "PENDING", entry_price: null, stop_price: agentPlan.stop } } as TradeRow);
      if (execution === "PAPER") {
        await logEvent({
          kind: "ORDER_PLACED",
          symbol: sym.symbol,
          message: `${sym.symbol} ${c.setup} ${c.score}: Limit ${agentPlan.entry.toPrecision(6)} · סטופ ${agentPlan.stop.toPrecision(6)} · יעד ${target.toPrecision(6)} · ×${multiplier} · ${verdict?.thesis ?? "deterministic"}`.slice(0, 300),
          push: true,
        });
      }
    } catch (err) {
      summary.errors.push(`scan ${c.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ── Tick ───────────────────────────────────────────────────────────────────

export async function runTick(now = Date.now()): Promise<TickSummary> {
  const started = Date.now();
  await ensureSeeded();
  let settings = await getSettings();
  const summary: TickSummary = { phase: settings.phase, positions_updated: 0, closed: 0, triggers: 0, entries: 0, vetoed: 0, blocked: 0, agent_calls: 0, lessons: 0, extensions: 0, playbook_version: null, screened: false, errors: [] };
  const cache = createBarCache(now);
  const frames = createFrameCache(cache);
  const universeRows = await getUniverse();
  const universe = new Map(universeRows.map((u) => [u.symbol, u]));
  const { params } = await getActiveV2Params();
  const today = new Date(now).toISOString().slice(0, 10);
  const calendar = await getCalendar(new Date(now - 2 * D1).toISOString().slice(0, 10));

  // Deferred risk-scale raise (friction): applies only after its cooldown.
  if (settings.pending_risk_scale !== null && settings.pending_risk_scale_at && Date.parse(settings.pending_risk_scale_at) <= now) {
    await updateSettings({ risk_scale: settings.pending_risk_scale, pending_risk_scale: null, pending_risk_scale_at: null });
    await logEvent({ kind: "RISK_SCALE", message: `הגדלת סיכון נכנסה לתוקף: ×${settings.pending_risk_scale}`, severity: "warn", push: true });
    settings = await getSettings();
  }

  const openTrades = await getOpenTrades();
  const lastPrices = new Map<string, number>();
  const earningsNext = openTrades.some((t) => t.asset_class === "STOCK") ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 2)) : new Set<string>();
  await advancePositions({ trades: openTrades, frames, universe, params, calendar, earningsNext, agentEnabled: settings.agent_enabled, now, summary, lastPrices });

  if (settings.agent_enabled) {
    try {
      await learnFromClosedTrades(openTrades.filter((t) => t.state === "CLOSED"), summary);
    } catch (err) {
      summary.errors.push(`learning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const stillOpen = openTrades.filter((t) => t.state === "PENDING" || t.state === "OPEN" || t.state === "RISK_FREE");
  const account = await loadAccount(settings, stillOpen, lastPrices, now);
  const peak = Math.max(settings.peak_equity, account.equity);

  // Master kill switch — full stop, manual re-arm only.
  if (!settings.kill_switch_active && shouldTripKillSwitch(account.equity, peak)) {
    for (const t of account.open) {
      const p = { ...t.sim_state };
      const ev: PositionEvent[] = forceClose(p, lastPrices.get(t.symbol) ?? p.entry_price ?? p.entry_limit, "KILL_SWITCH", now);
      await updateTrade(t.id, { ...simColumns(p), events: [...(t.events ?? []), ...ev], ...(p.state === "CLOSED" ? { realized_r: realizedR(p), realized_pnl: p.cash_flow } : {}) });
    }
    const reason = `Drawdown ${(drawdownFromPeak(account.equity, peak) * 100).toFixed(1)}% מהשיא`;
    await updateSettings({ kill_switch_active: true, kill_switch_reason: reason, kill_switch_at: iso(now), peak_equity: peak });
    await logEvent({ kind: "KILL_SWITCH", severity: "critical", message: `מפסק ראשי הופעל: ${reason}. כל הפוזיציות נסגרו.`, push: true });
    settings = await getSettings();
  } else if (peak !== settings.peak_equity) {
    await updateSettings({ peak_equity: peak });
  }

  if (settings.last_screen_date !== today) {
    await dailyScreen(universeRows, cache, now, summary);
    await updateSettings({ last_screen_date: today });
    summary.screened = true;
  }

  if (settings.phase === "BACKTEST") summary.skipped_reason = "phase_backtest_scanning_disabled";
  else if (settings.phase === "LIVE") {
    summary.skipped_reason = "live_broker_not_connected";
    await logEvent({ kind: "LIVE_BLOCKED", severity: "critical", message: "שלב LIVE נבחר אבל אין מתאם ברוקר — אין כניסות." });
  } else if (settings.kill_switch_active) summary.skipped_reason = "kill_switch_active";
  else {
    await scan({ settings, universe: universeRows, params, frames, cache, calendar, account, playbook: await getActivePlaybook(), now, started, summary });
  }

  await getSupabase()
    .from("trading_equity_snapshots")
    .upsert(
      {
        day: today,
        equity: round(account.equity, 2),
        peak_equity: round(peak, 2),
        open_risk_r: account.open.reduce((s, t) => s + openRiskR(t.sim_state), 0),
        open_positions: account.open.length,
        realized_r_day: account.realizedToday,
        updated_at: iso(now),
      },
      { onConflict: "day" }
    );

  summary.duration_ms = Date.now() - started;
  if (summary.errors.length) {
    await logEvent({ kind: "TICK_ERRORS", severity: summary.errors.length > 5 ? "critical" : "warn", message: summary.errors.slice(0, 5).join(" | ").slice(0, 900), data: summary.errors });
  }
  await updateSettings({ last_tick_at: iso(now), last_tick_summary: summary });
  return summary;
}
