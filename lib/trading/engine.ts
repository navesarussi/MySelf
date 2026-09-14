import { getSupabase } from "@/lib/supabase";
import { REGIME_REFERENCE, RISK_ENVELOPE, dailyTrendGroup, isCrypto } from "./config";
import { consolidatePlaybook, judgeDailyTrendTrigger, judgeTrigger, reviewClosedTrade, reviewExtension, type AgentVerdict, type ExperienceCard } from "./agent-judge";
import { returnCorrelation } from "./indicators";
import { evaluateEligibility } from "./learning";
import { createBarCache, fetchBidAskSpreadPct, fetchBtcDominance, fetchEarningsSymbols, fetchFundingRate, fetchVix, lookbackForClass, type BarCache } from "./market-data";
import { computeStats } from "./metrics";
import { applyExternalExit, applyExternalFill, forceClose, newPendingPosition, openRiskR, realizedR, stepPosition, type PositionEvent, type SimPosition } from "./position";
import { alpaca, flattenAtBroker, isAlpacaConfigured } from "./broker/alpaca";
import { bracketLegs, brokerExit, pendingDecision, protectiveAdjustments } from "./broker/sync";
import { checkNewEntry, drawdownFromPeak, shouldTripKillSwitch, weekStartIso } from "./risk-envelope";
import { buildTradePlan } from "./sizing";
import { LIVE_DAILY_TREND_PARAMS, buildDailyAsset, donchianExitBreached, scanDailyTrendCandidates, scoreDailyCandidate, type DailyAsset, type DailyCandidate } from "./strategy/daily-trend";
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
import { DISCRETION_POOL_PARAMS, analystBrief, evaluateCandidates, extensionDecision, isBaselineCandidate, lastBars, universeContext, type Candidate, type StrategyV2Params, type SymbolFrames } from "./strategy/candidates";
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
        const events: TradeRow["events"] = [...(trade.events ?? [])];
        const brokerPatch: Record<string, unknown> = {};
        // trigger_timestamp is the 4h close; the first manageable hourly bar is the one that opens at it.
        let from = trade.last_bar_time ? Date.parse(trade.last_bar_time) : Date.parse(trade.trigger_timestamp) - 1;

        // Real (paper) broker: fills come from the broker, never from the simulator.
        if (trade.broker && p.state === "PENDING") {
          const outcome = await resolveBrokerEntry(trade, p, events, input.now);
          Object.assign(brokerPatch, outcome.patch);
          if (outcome.done) {
            await persistTrade(trade, p, events, brokerPatch, from, h1, input);
            continue;
          }
          if (p.state === "PENDING") {
            if (Object.keys(brokerPatch).length) await updateTrade(trade.id, brokerPatch);
            continue;
          }
          // Manage from the first full hour after the fill.
          from = Math.floor((p.opened_at ?? input.now) / H1) * H1 + H1 - 1;
        }

        const freshIdx: number[] = [];
        for (let i = 0; i < h1.length; i++) if (h1[i].t > from) freshIdx.push(i);
        if (!freshIdx.length && !trade.broker) continue;

        const isDailyTrend = trade.strategy_version === "daily_trend";

        for (const i of freshIdx) {
          const bar = h1[i];
          const closeT = bar.t + H1;
          let raise: { raise_target_to?: number; raise_stop_to?: number } = {};
          // TP extension is a v2/4h concept only — daily-trend exits via chandelier trail + Donchian break.
          if (!isDailyTrend && input.params.extension_enabled && p.entry_price !== null && i > 0 && p.state !== "PENDING") {
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
          // Daily-trend uses the most recently CLOSED day's ATR throughout the day (matches the backtest's
          // day-granular trail, no look-ahead) and only checks its 20-day-low exit once that day closes.
          const dIdx = closedIdx(f.d1, bar.t + H1);
          const i4 = closedIdx(f.h4, bar.t);
          const donchianExit = isDailyTrend && dailyJustClosed && donchianExitBreached(f.d1, id, LIVE_DAILY_TREND_PARAMS.exit_days);
          const ev = stepPosition(p, bar, {
            atr: isDailyTrend ? (dIdx >= 0 ? f.d1.atr[dIdx] : NaN) : i4 >= 0 ? f.h4.atr[i4] : NaN,
            regime_flip: !isDailyTrend && dailyJustClosed && f.d1.bars[id].c < f.d1.ema200[id],
            force_exit_reason: donchianExit ? "TRAIL" : i === h1.length - 1 && earningsExit ? "EARNINGS" : undefined,
            ...raise,
          });
          events.push(...ev);
          if (p.state === "CLOSED" || p.state === "CANCELLED") break;
        }

        if (trade.broker && (p.state === "OPEN" || p.state === "RISK_FREE" || p.state === "CLOSED")) {
          Object.assign(brokerPatch, await mirrorToBroker(trade, p, events, input.lastPrices.get(symbol) ?? null, input.now));
        }
        await persistTrade(trade, p, events, brokerPatch, from, h1, input);
      }
    } catch (err) {
      input.summary.errors.push(`advance ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function persistTrade(
  trade: TradeRow,
  p: SimPosition,
  events: TradeRow["events"],
  brokerPatch: Record<string, unknown>,
  from: number,
  h1: Bar[],
  input: { summary: TickSummary; now: number }
) {
  const lastBar = [...h1].reverse().find((b) => b.t > from);
  const lastSeen = lastBar ? lastBar.t : trade.last_bar_time ? Date.parse(trade.last_bar_time) : null;
  const closedNow = p.state === "CLOSED";
  const chart = mergeChartBars(trade.chart_bars ?? [], h1.filter((b) => b.t > from && b.t <= (p.closed_at ?? lastSeen ?? input.now)));
  await updateTrade(trade.id, {
    ...simColumns(p),
    ...brokerPatch,
    events,
    ...(lastSeen !== null ? { last_bar_time: iso(lastSeen) } : {}),
    chart_bars: chart,
    ...(closedNow ? { realized_r: round(realizedR(p), 3), realized_pnl: round(p.cash_flow, 2) } : {}),
  });
  input.summary.positions_updated += 1;
  if ((closedNow || p.state === "CANCELLED") && trade.track === "AGENT" && trade.state !== p.state) {
    input.summary.closed += 1;
    const r = realizedR(p);
    await logEvent({
      kind: p.state === "CANCELLED" ? "ORDER_CANCELLED" : "TRADE_CLOSED",
      symbol: trade.symbol,
      message: p.state === "CANCELLED" ? `${trade.symbol}: פקודת כניסה בוטלה (${p.cancel_reason})` : `${trade.symbol}: נסגרה ${p.exit_reason} · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R`,
      data: { trade_id: trade.id },
      push: closedNow && trade.execution !== "SHADOW",
    });
  }
  trade.sim_state = p;
  trade.state = p.state;
  if (closedNow) {
    trade.realized_r = round(realizedR(p), 3);
    trade.chart_bars = chart;
    trade.events = events;
  }
}

// ── 1b. Broker mirror (Alpaca paper) ───────────────────────────────────────

async function resolveBrokerEntry(trade: TradeRow, p: SimPosition, events: TradeRow["events"], now: number): Promise<{ done: boolean; patch: Record<string, unknown> }> {
  if (!trade.broker_entry_order_id) {
    p.state = "CANCELLED";
    p.cancel_reason = "BROKER_ORDER_MISSING";
    p.closed_at = now;
    return { done: true, patch: {} };
  }
  const order = await alpaca.getOrder(trade.broker_entry_order_id);
  const d = pendingDecision(order, Date.parse(trade.trigger_timestamp), now);
  const patch: Record<string, unknown> = { broker_status: order.status, broker_filled_qty: Number(order.filled_qty) };
  const cancel = (reason: string) => {
    p.state = "CANCELLED";
    p.cancel_reason = reason;
    p.closed_at = now;
    events.push({ type: "CANCELLED", reason, at: now });
  };
  switch (d.kind) {
    case "WAIT":
      return { done: false, patch };
    case "EXPIRE":
      await alpaca.cancelOrder(order.id);
      cancel("NOT_FILLED");
      return { done: true, patch };
    case "DEAD":
      cancel(d.reason);
      return { done: true, patch };
    case "PARTIAL_UNWIND":
      // Below the 70% fill floor the position is too small to be the planned trade — exit it.
      await alpaca.cancelOrder(order.id);
      await alpaca.closePosition(trade.symbol, trade.asset_class).catch(() => null);
      cancel(`PARTIAL_FILL_${Math.round(d.ratio * 100)}PCT_UNWOUND`);
      return { done: true, patch };
    case "PARTIAL_KEEP":
    case "FILLED": {
      if (d.kind === "PARTIAL_KEEP") await alpaca.cancelOrder(order.id);
      events.push(...applyExternalFill(p, d.price, d.qty, d.at));
      const isDailyTrend = trade.strategy_version === "daily_trend";
      if (trade.asset_class === "STOCK" && !isDailyTrend) {
        // v2 stocks entered on a bracket — its legs already carry the stop/target.
        const legs = bracketLegs(order);
        patch.broker_stop_order_id = legs.stop?.id ?? null;
        patch.broker_target_order_id = legs.target?.id ?? null;
      } else if (trade.asset_class === "STOCK") {
        // Daily-trend stocks entered plain (no bracket, no real take-profit) — protective stop only.
        const stop = await alpaca.placeStockStop({ symbol: trade.symbol, qty: d.qty, stop: p.stop_price, clientId: `${trade.id.slice(0, 18)}-sl-${now}` });
        patch.broker_stop_order_id = stop.id;
      } else {
        const stop = await alpaca.placeCryptoStop({ symbol: trade.symbol, qty: d.qty, stop: p.stop_price, clientId: `${trade.id.slice(0, 18)}-sl-${now}` });
        patch.broker_stop_order_id = stop.id;
      }
      return { done: false, patch };
    }
  }
}

/** Make the broker match the strategy: adopt broker exits, close on strategy exits, move protective orders. */
async function mirrorToBroker(trade: TradeRow, p: SimPosition, events: TradeRow["events"], lastPrice: number | null, now: number): Promise<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};
  const stopId = (trade.broker_stop_order_id as string | null) ?? null;
  const targetId = (trade.broker_target_order_id as string | null) ?? null;
  const [stopOrder, targetOrder] = await Promise.all([stopId ? alpaca.getOrder(stopId) : null, targetId ? alpaca.getOrder(targetId) : null]);
  const exit = brokerExit({ stop: stopOrder, target: targetOrder, positionQty: null });
  const at = now;

  if (exit && Number.isFinite(exit.price)) {
    if (p.state === "CLOSED") repriceExit(p, exit.price);
    else events.push(...applyExternalExit(p, exit.price, exit.reason, at));
    patch.broker_status = `exit_${exit.reason.toLowerCase()}`;
    return patch;
  }

  if (p.state === "CLOSED") {
    // Strategy exit (stop/trail/target/regime/earnings) the broker hasn't executed — flatten at market.
    for (const id of [stopId, targetId]) if (id) await alpaca.cancelOrder(id);
    const closeOrder = await alpaca.closePosition(trade.symbol, trade.asset_class).catch((err) => {
      events.push({ type: "CANCELLED", reason: `BROKER_CLOSE_FAILED:${err instanceof Error ? err.message.slice(0, 80) : "?"}`, at });
      return null;
    });
    if (closeOrder) {
      await new Promise((r) => setTimeout(r, 1500));
      const filled = await alpaca.getOrder(closeOrder.id).catch(() => null);
      const px = Number(filled?.filled_avg_price);
      if (Number.isFinite(px) && px > 0) repriceExit(p, px);
      patch.broker_status = `closed_${(p.exit_reason ?? "manual").toLowerCase()}`;
    }
    return patch;
  }

  const adj = protectiveAdjustments({ assetClass: trade.asset_class, simStop: p.stop_price, simTarget: p.target_price, stop: stopOrder, target: targetOrder });
  if (adj.stopTo !== undefined && stopOrder) {
    const replaced = await alpaca.replaceOrder(stopOrder.id, trade.asset_class === "STOCK" ? { stop_price: adj.stopTo } : { stop_price: adj.stopTo, limit_price: adj.stopTo * 0.99 }, trade.asset_class);
    patch.broker_stop_order_id = replaced.id;
  }
  if (adj.targetTo !== undefined && targetOrder) {
    const replaced = await alpaca.replaceOrder(targetOrder.id, { limit_price: adj.targetTo }, trade.asset_class);
    patch.broker_target_order_id = replaced.id;
  }
  if (lastPrice === null) patch.broker_status = "open";
  return patch;
}

/** Replace a simulated exit price with the broker's actual fill. */
function repriceExit(p: SimPosition, price: number) {
  if (p.exit_price === null) return;
  const qty = p.initial_size - (p.partial_exit_price !== null ? p.initial_size * (p.partial_fraction ?? 0) : 0);
  p.cash_flow += (price - p.exit_price) * qty;
  p.exit_price = price;
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
  baseline_enter: boolean;
}): Promise<string> {
  const p = newPendingPosition({ asset_class: t.c.asset_class, entry: t.plan.entry, stop: t.plan.stop, size: t.plan.size });
  p.exit_plan = "STRUCTURAL";
  p.target_price = t.target;
  p.initial_target_price = t.target;
  p.breakeven_at_r = t.params.breakeven_at_r;
  p.partial_fraction = t.params.partial_fraction;
  p.trail_after_r = t.params.trail_after_r;
  p.trail_mult = t.params.trail_mult_atr4h;
  const { data, error } = await getSupabase()
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
      baseline_enter: t.baseline_enter,
      events: [],
      ...simColumns(p),
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert trade: ${error.message}`);
  return (data as { id: string }).id;
}

// ── 4b. Scan — daily-trend strategy (daily closes, wider universe) ─────────

function dailyTrendExperienceCard(symbol: string, closed: TradeRow[]): ExperienceCard {
  const det = closed.filter((t) => t.track === "DETERMINISTIC" && t.strategy_version === "daily_trend");
  const mine = det.filter((t) => t.symbol === symbol);
  const stat = (list: TradeRow[]) => computeStats(list.map((t) => ({ r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at ?? t.created_at) })));
  const s = stat(mine);
  const all = stat(det);
  const slips = mine.map((t) => t.entry_slippage_bps).filter((x): x is number => x !== null);
  return {
    symbol_trades: s.trades,
    symbol_expectancy_r: s.trades ? s.expectancy_r : null,
    similar_setup_trades: all.trades,
    similar_setup_expectancy_r: all.trades ? all.expectancy_r : null,
    similar_setup_win_rate: all.trades ? all.win_rate : null,
    avg_slippage_bps: slips.length ? Math.round(slips.reduce((x, y) => x + y, 0) / slips.length) : null,
  };
}

async function insertDailyTrendTrade(t: {
  trigger_id: string;
  c: DailyCandidate;
  track: "DETERMINISTIC" | "AGENT";
  execution: "SHADOW" | "PAPER";
  snapshot: Record<string, unknown>;
  plan: { entry: number; stop: number; size: number; risk_amount: number };
  score: number;
  verdict: AgentVerdict | null;
  chart: Bar[];
}): Promise<string> {
  const p = newPendingPosition({ asset_class: t.c.a.asset_class, entry: t.plan.entry, stop: t.plan.stop, size: t.plan.size });
  p.exit_plan = "STRUCTURAL";
  p.target_price = t.c.target;
  p.initial_target_price = t.c.target;
  p.breakeven_at_r = LIVE_DAILY_TREND_PARAMS.breakeven_at_r;
  p.partial_fraction = 0;
  p.trail_after_r = LIVE_DAILY_TREND_PARAMS.trail_after_r;
  p.trail_mult = LIVE_DAILY_TREND_PARAMS.trail_atr;
  const { data, error } = await getSupabase()
    .from("trading_trades")
    .insert({
      trigger_id: t.trigger_id,
      symbol: t.c.symbol,
      asset_class: t.c.a.asset_class,
      bucket_id: `daily_trend:${t.c.group}`,
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
      param_version: LIVE_DAILY_TREND_PARAMS.version,
      strategy_version: "daily_trend",
      setup: "DAILY_BREAKOUT",
      score: t.score,
      entry_limit: t.plan.entry,
      initial_stop_price: t.plan.stop,
      position_size: t.plan.size,
      risk_amount: t.plan.risk_amount,
      chart_bars: t.chart,
      baseline_enter: true,
      events: [],
      ...simColumns(p),
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert daily-trend trade: ${error.message}`);
  return (data as { id: string }).id;
}

async function scanDailyTrend(input: {
  settings: TradingSettings;
  universe: UniverseRow[];
  cache: BarCache;
  account: Account;
  playbook: PlaybookRow | null;
  now: number;
  started: number;
  summary: TickSummary;
}) {
  const { settings, cache, now, summary } = input;
  const p = LIVE_DAILY_TREND_PARAMS;
  const useBroker = settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured();
  const cryptoTradable = useBroker ? await alpaca.tradableSymbols().catch(() => new Set<string>()) : new Set<string>();
  const eligible = input.universe.filter((u) => u.manual_enabled && u.screen_passed && u.eligibility !== "DISABLED_POOR");
  if (!eligible.length) return;

  // The regime reference (SPY/BTC) must exist for the group filter regardless of ITS OWN screen — a broad
  // index/large-cap naturally has low ATR% and can legitimately fail the volatility screen while still being
  // the correct regime gauge (v2's scan() already does this; scanning it here matches that, not a re-screen).
  const buildReference = async (ref: UniverseSymbol): Promise<DailyAsset | undefined> => {
    try {
      const bars = await barsFor(cache, ref, "1d");
      return bars.length >= 260 ? buildDailyAsset(ref.symbol, ref.asset_class, dailyTrendGroup(ref.symbol, ref.asset_class), bars) : undefined;
    } catch (err) {
      summary.errors.push(`daily-reference ${ref.symbol}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };
  // ETF group intentionally has no regime reference — matches the validated research config exactly.
  const references: Record<string, DailyAsset | undefined> = { CRYPTO: await buildReference(REGIME_REFERENCE.CRYPTO_ALT), STOCKS: await buildReference(REGIME_REFERENCE.STOCK), ETF: undefined };

  const assets: DailyAsset[] = [];
  for (const u of eligible) {
    if (u.symbol === references.CRYPTO?.symbol || u.symbol === references.STOCKS?.symbol) {
      // Already built above — reuse rather than refetch (cache would hit anyway, this just skips the extra pass).
      assets.push((u.symbol === references.CRYPTO?.symbol ? references.CRYPTO : references.STOCKS)!);
      continue;
    }
    try {
      const bars = await barsFor(cache, toSym(u), "1d");
      if (bars.length < 260) continue;
      assets.push(buildDailyAsset(u.symbol, u.asset_class, dailyTrendGroup(u.symbol, u.asset_class), bars));
    } catch (err) {
      summary.errors.push(`daily-asset ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!assets.length) return;

  // Symbols may publish their latest daily close at different UTC times (crypto vs. lagging equities data) —
  // scan once per distinct "latest bar" timestamp so each group is ranked against its own freshest cohort.
  const distinctT = [...new Set(assets.map((a) => a.d1.bars.at(-1)?.t).filter((t): t is number => t !== undefined))];
  let found: DailyCandidate[] = [];
  for (const t of distinctT) found.push(...scanDailyTrendCandidates(assets, t, references, p));
  // A symbol could theoretically surface under more than one pass — keep the first.
  const seen = new Set<string>();
  found = found.filter((c) => (seen.has(`${c.symbol}|${c.t}`) ? false : (seen.add(`${c.symbol}|${c.t}`), true)));
  if (!found.length) return;
  found.sort((a, b) => (b.rs ?? 0.5) - (a.rs ?? 0.5));

  const closed = await getClosedTrades();
  const earnings = found.some((c) => c.a.asset_class === "STOCK") ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 4)) : new Set<string>();
  const [vix, dominance] = await Promise.all([fetchVix(), fetchBtcDominance()]);
  const calendar = await getCalendar(new Date(now - 2 * D1).toISOString().slice(0, 10));

  for (const c of found) {
    if (Date.now() - input.started > TICK_TIME_BUDGET_MS) {
      summary.errors.push("time_budget_exhausted_daily_trend");
      return;
    }
    const u = eligible.find((x) => x.symbol === c.symbol)!;
    const sym = toSym(u);
    try {
      summary.triggers += 1;
      const score = scoreDailyCandidate(c.features, c.rs);
      const funding = isCrypto(sym.asset_class) ? await fetchFundingRate(sym.provider_symbol) : undefined;
      const vetoes = evaluateVetoes({ symbol: sym.symbol, asset_class: sym.asset_class, mode: "SWING", now: new Date(now), calendar, earnings_symbols: earnings, funding_rate: funding });

      const correlated: string[] = [];
      const correlations: Record<string, number | null> = {};
      for (const t of input.account.open) {
        const other = assets.find((a) => a.symbol === t.symbol);
        if (!other) continue;
        const rho = returnCorrelation(c.a.d1.bars.map((b) => b.c), other.d1.bars.map((b) => b.c));
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
      const basePlan = buildTradePlan({ entry: c.entry, stopDistance: c.stopDist, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale });
      const deterministic = vetoes.length ? "VETO" : blocks.length || !basePlan ? "BLOCKED" : "ENTER";
      const snapshot = { candidate: { symbol: c.symbol, group: c.group, entry: c.entry, stop: c.stop, target: c.target, rs: c.rs, room_r: c.room, features: c.features }, correlations, funding_rate: funding ?? null, vix, btc_dominance_pct: dominance };

      const { data: trig, error: trigErr } = await getSupabase()
        .from("trading_triggers")
        .upsert(
          {
            symbol: sym.symbol,
            asset_class: sym.asset_class,
            mode: "SWING",
            bucket_id: `daily_trend:${c.group}`,
            bar_time: iso(c.t),
            setup: "DAILY_BREAKOUT",
            score,
            snapshot,
            vetoes,
            envelope_blocks: blocks,
            plan: basePlan ? { ...basePlan, target: c.target } : null,
            deterministic_decision: deterministic,
            baseline_enter: true,
            param_version: p.version,
            strategy_version: "daily_trend",
            phase: settings.phase,
          },
          { onConflict: "symbol,mode,bar_time,strategy_version", ignoreDuplicates: true }
        )
        .select("id")
        .maybeSingle();
      if (trigErr) throw new Error(trigErr.message);
      if (!trig) continue; // already processed by an earlier tick
      const triggerId = String((trig as { id: string }).id);
      if (vetoes.length || !basePlan) {
        summary.vetoed += vetoes.length ? 1 : 0;
        continue;
      }

      let verdict: AgentVerdict | null = null;
      let flags: string[] = [];
      if (settings.agent_enabled && summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
        summary.agent_calls += 1;
        const judged = await judgeDailyTrendTrigger(
          {
            symbol: sym.symbol,
            group: c.group,
            entry: c.entry,
            stop: c.stop,
            target: c.target,
            score,
            rs: c.rs,
            room_r: c.room,
            features: c.features as unknown as Record<string, number | null>,
            bars_d1: c.a.d1.bars.slice(Math.max(0, c.i - 89), c.i + 1),
            experience: dailyTrendExperienceCard(sym.symbol, closed),
            portfolio: {
              open_positions: input.account.open.map((t) => ({ symbol: t.symbol, state: t.state, open_risk_r: openRiskR(t.sim_state), correlation: correlations[t.symbol] ?? null })),
              open_risk_r: openRisk.reduce((s, pp) => s + pp.open_risk_r, 0),
              realized_r_today: input.account.realizedToday,
              realized_r_week: input.account.realizedWeek,
              drawdown_pct: drawdownFromPeak(input.account.equity, settings.peak_equity),
            },
            market: { vix, btc_dominance_pct: dominance, headlines: [] },
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

      const chart = c.a.d1.bars.slice(Math.max(0, c.i - CHART_BARS_BEFORE + 1), c.i + 1);
      const base = { trigger_id: triggerId, c, snapshot: snapshot as unknown as Record<string, unknown>, verdict, chart, score };

      // Deterministic baseline — always simulated forward in shadow.
      await insertDailyTrendTrade({ ...base, track: "DETERMINISTIC", execution: "SHADOW", plan: basePlan });

      const multiplier = verdict ? verdict.risk_multiplier : 1;
      if (settings.phase === "BACKTEST" || multiplier === 0) continue;
      if (blocks.length) {
        summary.blocked += 1;
        continue;
      }
      const agentPlan = buildTradePlan({ entry: c.entry, stopDistance: c.stopDist, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale * multiplier });
      if (!agentPlan) continue;
      const execution = settings.phase === "PAPER" && u.eligibility === "ACTIVE" ? "PAPER" : "SHADOW";
      const brokerOk = useBroker && execution === "PAPER" && (sym.asset_class === "STOCK" ? await alpaca.isStockTradable(sym.symbol) : cryptoTradable.has(`${sym.symbol}/USD`));
      const tradeId = await insertDailyTrendTrade({ ...base, track: "AGENT", execution, plan: agentPlan });
      summary.entries += 1;
      if (brokerOk) {
        try {
          const order = await alpaca.placeEntry({ symbol: sym.symbol, assetClass: sym.asset_class, qty: agentPlan.size, limit: agentPlan.entry, stop: agentPlan.stop, target: c.target, clientId: `${tradeId.slice(0, 18)}-in`, bracket: false });
          await updateTrade(tradeId, { broker: "ALPACA_PAPER", broker_entry_order_id: order.id, broker_status: order.status });
        } catch (err) {
          const reason = err instanceof Error ? err.message.slice(0, 160) : "broker_error";
          await updateTrade(tradeId, { state: "CANCELLED", exit_reason: "BROKER_REJECTED", broker: "ALPACA_PAPER", broker_status: reason, closed_at: iso(now) });
          await logEvent({ kind: "BROKER_REJECTED", symbol: sym.symbol, severity: "warn", message: `${sym.symbol}: הברוקר דחה את הפקודה (מגמה יומית) — ${reason}` });
          continue;
        }
      } else if (useBroker && execution === "PAPER") {
        await logEvent({ kind: "BROKER_UNSUPPORTED", symbol: sym.symbol, message: `${sym.symbol}: לא נסחר ב-Alpaca — העסקה נשארת בסימולציה` });
      }
      input.account.open.push({ symbol: sym.symbol, entry_limit: agentPlan.entry, remaining_size: agentPlan.size, state: "PENDING", sim_state: { state: "PENDING", entry_price: null, stop_price: agentPlan.stop } } as TradeRow);
      if (execution === "PAPER") {
        await logEvent({
          kind: "ORDER_PLACED",
          symbol: sym.symbol,
          message: `${brokerOk ? "[Alpaca demo] " : ""}${sym.symbol} מגמה יומית ${score}: Limit ${agentPlan.entry.toPrecision(6)} · סטופ ${agentPlan.stop.toPrecision(6)} · ×${multiplier} · ${verdict?.thesis ?? "deterministic"}`.slice(0, 300),
          push: true,
        });
      }
    } catch (err) {
      summary.errors.push(`scan-daily-trend ${c.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
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
  // הסוכן מסחר chooses from a wider pool than the deterministic baseline would take (same management rules).
  const pool: StrategyV2Params = settings.agent_enabled
    ? { ...params, min_score: Math.min(params.min_score, DISCRETION_POOL_PARAMS.min_score), setups: DISCRETION_POOL_PARAMS.setups }
    : params;
  const useBroker = settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured();
  const cryptoTradable = useBroker ? await alpaca.tradableSymbols().catch(() => new Set<string>()) : new Set<string>();
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
    found.push(...evaluateCandidates(f, T, { reference_ok: referenceOk, rs_rank: uctx.rank.get(f.symbol) ?? null, breadth: uctx.breadth }, pool).candidates);
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
      const baselineEnter = isBaselineCandidate(c, params);
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
            baseline_enter: baselineEnter,
            param_version: pool.version,
            strategy_version: STRATEGY_VERSION,
            phase: settings.phase,
          },
          { onConflict: "symbol,mode,bar_time,strategy_version", ignoreDuplicates: true }
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
      // Discretionary candidates the envelope already blocks aren't worth a model call; baseline ones are (measurement).
      const worthJudging = baselineEnter || blocks.length === 0;
      if (settings.agent_enabled && worthJudging && summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
        summary.agent_calls += 1;
        const i1 = closedIdx(f.h1, T);
        const judged = await judgeTrigger(
          {
            symbol: sym.symbol,
            baseline_would_enter: baselineEnter,
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
      await insertTrade({ ...base, track: "DETERMINISTIC", execution: "SHADOW", plan: basePlan, target: c.target, baseline_enter: baselineEnter });

      // No verdict (agent off / budget) → only what the deterministic baseline would take.
      const multiplier = verdict ? verdict.risk_multiplier : baselineEnter ? 1 : 0;
      if (settings.phase === "BACKTEST" || multiplier === 0) continue;
      if (blocks.length) {
        summary.blocked += 1;
        continue;
      }
      const agentPlan = buildTradePlan({ entry: c.entry, stopDistance: c.entry - c.stop, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale * multiplier });
      if (!agentPlan) continue;
      const target = c.target_menu[verdict?.target_index ?? 0]?.price ?? c.target;
      const execution = settings.phase === "PAPER" && u.eligibility === "ACTIVE" ? "PAPER" : "SHADOW";
      const brokerOk =
        useBroker && execution === "PAPER" && (sym.asset_class === "STOCK" ? await alpaca.isStockTradable(sym.symbol) : cryptoTradable.has(`${sym.symbol}/USD`));
      const tradeId = await insertTrade({ ...base, track: "AGENT", execution, plan: agentPlan, target, baseline_enter: baselineEnter });
      summary.entries += 1;
      if (brokerOk) {
        try {
          const order = await alpaca.placeEntry({ symbol: sym.symbol, assetClass: sym.asset_class, qty: agentPlan.size, limit: agentPlan.entry, stop: agentPlan.stop, target, clientId: `${tradeId.slice(0, 18)}-in` });
          await updateTrade(tradeId, { broker: "ALPACA_PAPER", broker_entry_order_id: order.id, broker_status: order.status });
        } catch (err) {
          const reason = err instanceof Error ? err.message.slice(0, 160) : "broker_error";
          await updateTrade(tradeId, { state: "CANCELLED", exit_reason: "BROKER_REJECTED", broker: "ALPACA_PAPER", broker_status: reason, closed_at: iso(now) });
          await logEvent({ kind: "BROKER_REJECTED", symbol: sym.symbol, severity: "warn", message: `${sym.symbol}: הברוקר דחה את הפקודה — ${reason}` });
          continue;
        }
      } else if (useBroker && execution === "PAPER") {
        await logEvent({ kind: "BROKER_UNSUPPORTED", symbol: sym.symbol, message: `${sym.symbol}: לא נסחר ב-Alpaca — העסקה נשארת בסימולציה` });
      }
      input.account.open.push({ symbol: sym.symbol, entry_limit: agentPlan.entry, remaining_size: agentPlan.size, state: "PENDING", sim_state: { state: "PENDING", entry_price: null, stop_price: agentPlan.stop } } as TradeRow);
      if (execution === "PAPER") {
        await logEvent({
          kind: "ORDER_PLACED",
          symbol: sym.symbol,
          message: `${brokerOk ? "[Alpaca demo] " : ""}${sym.symbol} ${c.setup} ${c.score}${baselineEnter ? "" : " (AI)"}: Limit ${agentPlan.entry.toPrecision(6)} · סטופ ${agentPlan.stop.toPrecision(6)} · יעד ${target.toPrecision(6)} · ×${multiplier} · ${verdict?.thesis ?? "deterministic"}`.slice(0, 300),
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
  if (settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured()) {
    // The demo account's real equity (includes positions the strategy doesn't know about) sizes every trade.
    try {
      const acct = await alpaca.account();
      if (acct.trading_blocked || acct.account_blocked) summary.errors.push("alpaca_account_blocked");
      account.equity = Number(acct.equity);
    } catch (err) {
      summary.errors.push(`alpaca_account: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
  const peak = Math.max(settings.peak_equity, account.equity);

  // Master kill switch — full stop, manual re-arm only.
  if (!settings.kill_switch_active && shouldTripKillSwitch(account.equity, peak)) {
    for (const t of account.open) {
      const p = { ...t.sim_state };
      const brokerPx = t.broker ? await flattenAtBroker(t).catch(() => null) : null;
      const ev: PositionEvent[] = forceClose(p, brokerPx ?? lastPrices.get(t.symbol) ?? p.entry_price ?? p.entry_limit, "KILL_SWITCH", now);
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
    const playbook = await getActivePlaybook();
    await scan({ settings, universe: universeRows, params, frames, cache, calendar, account, playbook, now, started, summary });
    // Daily-trend scans once per day (its signal only changes on a daily close) — gate separately from
    // v2's 4h scan, but share the SAME account/portfolio state so the combined envelope is respected.
    if (settings.last_daily_trend_scan_date !== today) {
      try {
        await scanDailyTrend({ settings, universe: universeRows, cache, account, playbook, now, started, summary });
        await updateSettings({ last_daily_trend_scan_date: today });
      } catch (err) {
        summary.errors.push(`daily_trend_scan: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
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
