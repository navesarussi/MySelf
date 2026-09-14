import { getSupabase } from "@/lib/supabase";
import { MODE_TIMEFRAMES, REGIME_REFERENCE, RISK_ENVELOPE, isCrypto, type StrategyParams } from "./config";
import { chooseExitPlan, judgeTrigger, type AgentVerdict, type AssetHistoryCard } from "./agent-judge";
import { dailyBelowEma200 } from "./backtest";
import { atr, ema, returnCorrelation } from "./indicators";
import { evaluateEligibility } from "./learning";
import {
  TF_MS,
  createBarCache,
  fetchBidAskSpreadPct,
  fetchBtcDominance,
  fetchEarningsSymbols,
  fetchFundingRate,
  fetchVix,
  lookbackForClass,
  type BarCache,
} from "./market-data";
import { computeStats } from "./metrics";
import { forceClose, newPendingPosition, openRiskR, realizedR, stepPosition, type PositionEvent, type SimPosition } from "./position";
import { checkNewEntry, drawdownFromPeak, shouldTripKillSwitch, weekStartIso } from "./risk-envelope";
import { buildSetupSeries, buildTradePlan, evaluateSetup, stopDistanceFor } from "./setup";
import {
  ensureSeeded,
  getActiveParams,
  getCalendar,
  getClosedTrades,
  getOpenTrades,
  getSettings,
  getUniverse,
  isAccountTrade,
  logEvent,
  simColumns,
  toJournalTrade,
  updateSettings,
  updateTrade,
  type TradeRow,
  type TradingSettings,
  type UniverseRow,
} from "./store";
import { bucketId, screenFailures, screenMetricsAt } from "./universe";
import { evaluateVetoes, isoDateInZone, mustExitBeforeEarnings, nextTradingDays, type CalendarEvent } from "./veto";
import type { Bar, TradingMode, UniverseSymbol } from "./types";

/**
 * The live pipeline, run by an external scheduler every 15 minutes (GitHub Actions → /api/trading/tick).
 * Idempotent: triggers are unique per (symbol, mode, bar) and positions only advance over unseen bars.
 */

const TICK_TIME_BUDGET_MS = 240_000;
const MAX_AGENT_CALLS_PER_TICK = 10;
const CHART_BARS_BEFORE = 60;
const CHART_BARS_MAX = 240;

type TickSummary = {
  phase: string;
  positions_updated: number;
  closed: number;
  triggers: number;
  entries: number;
  vetoed: number;
  blocked: number;
  agent_calls: number;
  screened: boolean;
  errors: string[];
  skipped_reason?: string;
  duration_ms?: number;
};

const iso = (ms: number) => new Date(ms).toISOString();

function toSym(u: Pick<UniverseRow, "symbol" | "asset_class" | "provider_symbol">): UniverseSymbol {
  return { symbol: u.symbol, asset_class: u.asset_class, provider_symbol: u.provider_symbol };
}

async function barsFor(cache: BarCache, sym: UniverseSymbol, tf: "15m" | "4h" | "1d") {
  return cache.get(sym, tf, lookbackForClass(sym.asset_class, tf));
}

// ── Account ─────────────────────────────────────────────────────────────────

type Account = {
  equity: number;
  realizedToday: number;
  realizedWeek: number;
  open: TradeRow[];
};

function markToMarket(t: TradeRow, lastPrice: number | undefined) {
  const p = t.sim_state;
  if (p.entry_price === null) return 0;
  return p.cash_flow + (lastPrice ?? p.entry_price) * p.size;
}

async function loadAccount(settings: TradingSettings, openTrades: TradeRow[], lastPrices: Map<string, number>, now: number): Promise<Account> {
  const closed = (await getClosedTrades()).filter((t) => isAccountTrade(t, settings.phase));
  const phaseStart = Date.parse(settings.phase_started_at);
  const inPhase = closed.filter((t) => t.closed_at && Date.parse(t.closed_at) >= phaseStart);
  const today = new Date(now).toISOString().slice(0, 10);
  const week = weekStartIso(new Date(now));
  const open = openTrades.filter((t) => isAccountTrade(t, settings.phase));
  const realizedPnl = inPhase.reduce((s, t) => s + (t.realized_pnl ?? 0), 0);
  const unrealized = open.reduce((s, t) => s + markToMarket(t, lastPrices.get(t.symbol)), 0);
  return {
    equity: settings.starting_equity + realizedPnl + unrealized,
    realizedToday: inPhase.filter((t) => t.closed_at!.slice(0, 10) === today).reduce((s, t) => s + (t.realized_r ?? 0), 0),
    realizedWeek: inPhase.filter((t) => weekStartIso(new Date(t.closed_at!)) === week).reduce((s, t) => s + (t.realized_r ?? 0), 0),
    open,
  };
}

// ── 1. Advance open positions ──────────────────────────────────────────────

async function advancePositions(input: {
  trades: TradeRow[];
  cache: BarCache;
  universe: Map<string, UniverseRow>;
  params: StrategyParams;
  calendar: CalendarEvent[];
  earningsNext: Set<string> | null;
  agentEnabled: boolean;
  now: number;
  summary: TickSummary;
  lastPrices: Map<string, number>;
}) {
  const groups = new Map<string, TradeRow[]>();
  for (const t of input.trades) groups.set(`${t.symbol}|${t.mode}`, [...(groups.get(`${t.symbol}|${t.mode}`) ?? []), t]);

  for (const [key, trades] of groups) {
    const [symbol, mode] = key.split("|") as [string, TradingMode];
    const u = input.universe.get(symbol);
    if (!u) continue;
    const sym = toSym(u);
    const tf = MODE_TIMEFRAMES[mode].entry;
    try {
      const [bars, daily] = await Promise.all([barsFor(input.cache, sym, tf), barsFor(input.cache, sym, "1d")]);
      if (!bars.length) continue;
      input.lastPrices.set(symbol, bars[bars.length - 1].c);
      const atrSeries = atr(bars, 14);
      const dailyEma = ema(daily.map((b) => b.c), 200);
      const earningsExit = sym.asset_class === "STOCK" && mustExitBeforeEarnings(symbol, new Date(input.now), input.calendar, input.earningsNext);

      for (const trade of trades) {
        const p: SimPosition = { ...trade.sim_state };
        const from = trade.last_bar_time ? Date.parse(trade.last_bar_time) : Date.parse(trade.trigger_timestamp);
        const fresh = bars.map((b, i) => ({ b, i })).filter(({ b }) => b.t > from);
        if (!fresh.length) continue;
        const events: TradeRow["events"] = [...(trade.events ?? [])];
        for (const { b, i } of fresh) {
          const barClose = b.t + TF_MS[tf];
          // Regime flip = a daily candle that closed during this bar finished below its EMA200.
          const flipIdx = daily.findIndex((d) => d.t + TF_MS["1d"] > b.t && d.t + TF_MS["1d"] <= barClose);
          const regimeFlip = flipIdx >= 0 && Number.isFinite(dailyEma[flipIdx]) && daily[flipIdx].c < dailyEma[flipIdx];
          const isLast = i === bars.length - 1;
          const ev = stepPosition(p, b, {
            atr: atrSeries[i],
            trail_atr_mult: input.params.trail_atr_mult,
            regime_flip: regimeFlip,
            force_exit_reason: isLast && earningsExit ? "EARNINGS" : undefined,
          });
          events.push(...ev);
          if (ev.some((e) => e.type === "PARTIAL_1R") && trade.track === "AGENT" && input.agentEnabled) {
            // The agent's only live authority: what to do with the second half, after 1R.
            const choice = await chooseExitPlan({ symbol, bars: bars.slice(0, i + 1), snapshot: trade.trigger_snapshot });
            p.exit_plan = choice.plan;
            events.push({ type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: b.t, note: `exit plan ${choice.plan}: ${choice.reasoning}` });
          }
          if (p.state === "CLOSED" || p.state === "CANCELLED") break;
        }
        const lastSeen = fresh[fresh.length - 1].b.t;
        const chart = mergeChartBars(trade.chart_bars ?? [], bars.filter((b) => b.t > from && b.t <= (p.closed_at ?? lastSeen)));
        const closedNow = p.state === "CLOSED";
        await updateTrade(trade.id, {
          ...simColumns(p),
          events,
          last_bar_time: iso(lastSeen),
          chart_bars: chart,
          ...(closedNow ? { realized_r: Math.round(realizedR(p) * 1000) / 1000, realized_pnl: Math.round(p.cash_flow * 100) / 100 } : {}),
        });
        input.summary.positions_updated += 1;
        if (closedNow || p.state === "CANCELLED") {
          input.summary.closed += 1;
          if (isAccountTradeOfInterest(trade)) {
            const r = realizedR(p);
            await logEvent({
              kind: p.state === "CANCELLED" ? "ORDER_CANCELLED" : "TRADE_CLOSED",
              symbol,
              message:
                p.state === "CANCELLED"
                  ? `${symbol}: פקודת כניסה בוטלה (${p.cancel_reason})`
                  : `${symbol}: נסגרה ${p.exit_reason} · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R`,
              data: { trade_id: trade.id },
              push: p.state === "CLOSED" && trade.execution !== "SHADOW",
            });
          }
        }
        trade.sim_state = p;
        trade.state = p.state;
      }
    } catch (err) {
      input.summary.errors.push(`advance ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function isAccountTradeOfInterest(t: TradeRow) {
  return t.track === "AGENT";
}

function mergeChartBars(existing: Bar[], add: Bar[]): Bar[] {
  const map = new Map(existing.map((b) => [b.t, b]));
  for (const b of add) map.set(b.t, b);
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-CHART_BARS_MAX);
}

// ── 2. Daily screen + eligibility gate ─────────────────────────────────────

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
        .update({
          screen_passed: failures.length === 0,
          screen_failures: failures,
          bucket_id: bucketId(sym.asset_class, m),
          metrics: m,
          last_screened_at: iso(now),
          updated_at: iso(now),
        })
        .eq("symbol", u.symbol);
      u.screen_passed = failures.length === 0;
      u.bucket_id = bucketId(sym.asset_class, m);
    } catch (err) {
      summary.errors.push(`screen ${u.symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const closed = await getClosedTrades();
  const decisions = evaluateEligibility({
    universe: universe.map((u) => ({
      symbol: u.symbol,
      bucket_id: u.bucket_id,
      eligibility: u.eligibility,
      eligibility_changed_at: u.eligibility_changed_at ? Date.parse(u.eligibility_changed_at) : null,
    })),
    trades: closed.map(toJournalTrade),
    now,
  });
  for (const d of decisions) {
    await sb
      .from("trading_universe")
      .update({ eligibility: d.to, eligibility_changed_at: iso(now), eligibility_note: d.reason, updated_at: iso(now) })
      .eq("symbol", d.symbol);
    const u = universe.find((x) => x.symbol === d.symbol);
    if (u) {
      u.eligibility = d.to;
      u.eligibility_changed_at = iso(now);
    }
    await logEvent({ kind: "ELIGIBILITY", symbol: d.symbol, severity: "warn", message: `${d.symbol}: ${d.from} → ${d.to} (${d.reason})`, push: true });
  }
}

// ── 3. Scan for triggers ───────────────────────────────────────────────────

function historyCard(symbol: string, bucket: string, closed: TradeRow[]): AssetHistoryCard {
  const det = closed.filter((t) => t.track === "DETERMINISTIC");
  const mine = det.filter((t) => t.symbol === symbol);
  const inBucket = det.filter((t) => t.bucket_id === bucket);
  const s = computeStats(mine.map((t) => ({ r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at ?? t.created_at), reached_1r: t.reached_1r })));
  const b = computeStats(inBucket.map((t) => ({ r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at ?? t.created_at) })));
  const slips = mine.map((t) => t.entry_slippage_bps).filter((x): x is number => x !== null);
  return {
    trades: s.trades,
    expectancy_r: s.trades ? s.expectancy_r : null,
    reached_1r_rate: s.trades ? s.reached_1r_rate : null,
    avg_slippage_bps: slips.length ? Math.round(slips.reduce((x, y) => x + y, 0) / slips.length) : null,
    gaps_through_stop: mine.filter((t) => t.gapped_through_stop).length,
    bucket_id: bucket,
    bucket_trades: b.trades,
    bucket_expectancy_r: b.trades ? b.expectancy_r : null,
  };
}

type TradeInsert = {
  trigger_id: string;
  sym: UniverseSymbol;
  bucket: string;
  mode: TradingMode;
  track: "DETERMINISTIC" | "AGENT";
  execution: "SHADOW" | "PAPER";
  barTime: number;
  snapshot: Record<string, unknown>;
  plan: { entry: number; stop: number; target: number; size: number; risk_amount: number };
  verdict: AgentVerdict | null;
  params: StrategyParams;
  chart: Bar[];
};

async function insertTrade(t: TradeInsert) {
  const p = newPendingPosition({ asset_class: t.sym.asset_class, entry: t.plan.entry, stop: t.plan.stop, size: t.plan.size });
  if (t.track === "DETERMINISTIC") p.exit_plan = "TARGET_2R";
  const { error } = await getSupabase()
    .from("trading_trades")
    .insert({
      trigger_id: t.trigger_id,
      symbol: t.sym.symbol,
      asset_class: t.sym.asset_class,
      bucket_id: t.bucket,
      mode: t.mode,
      track: t.track,
      execution: t.execution,
      trigger_timestamp: iso(t.barTime),
      trigger_snapshot: t.snapshot,
      agent_decision: t.verdict?.decision ?? "ENTER",
      agent_conviction: t.verdict?.conviction ?? null,
      agent_risk_multiplier: t.verdict?.risk_multiplier ?? 1,
      agent_reasoning: t.verdict?.primary_reasoning ?? null,
      agent_model_version: t.verdict?.model_version ?? "agent-disabled",
      prompt_version: t.verdict?.prompt_version ?? "none",
      param_version: t.params.version,
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
  params: StrategyParams;
  cache: BarCache;
  calendar: CalendarEvent[];
  account: Account;
  openTrades: TradeRow[];
  now: number;
  started: number;
  summary: TickSummary;
}) {
  const { settings, params, cache, now, summary } = input;
  const modes: TradingMode[] = settings.intraday_enabled ? ["SWING", "INTRADAY"] : ["SWING"];
  const candidates = input.universe.filter((u) => u.manual_enabled && u.screen_passed && u.eligibility !== "DISABLED_POOR");
  const closed = await getClosedTrades();
  const needsEarnings = candidates.some((u) => u.asset_class === "STOCK");
  const earnings = needsEarnings ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 4)) : new Set<string>();
  const [vix, dominance] = await Promise.all([fetchVix(), fetchBtcDominance()]);
  const marketDaily = new Map<string, Bar[]>();
  const regimeDaily = async (sym: UniverseSymbol) => {
    const ref = REGIME_REFERENCE[sym.asset_class];
    if (!marketDaily.has(ref.symbol)) marketDaily.set(ref.symbol, await barsFor(cache, ref, "1d"));
    return marketDaily.get(ref.symbol)!;
  };

  for (const mode of modes) {
    const tfs = MODE_TIMEFRAMES[mode];
    for (const u of candidates) {
      if (Date.now() - input.started > TICK_TIME_BUDGET_MS) {
        summary.errors.push("time_budget_exhausted");
        return;
      }
      const sym = toSym(u);
      try {
        const entry = await barsFor(cache, sym, tfs.entry);
        if (entry.length < 80) continue;
        const last = entry[entry.length - 1];
        // Only evaluate a bar that closed since the previous tick window.
        if (now - (last.t + TF_MS[tfs.entry]) > Math.max(TF_MS[tfs.entry], 30 * 60_000)) continue;
        const trend = tfs.trend === "1d" ? await barsFor(cache, sym, "1d") : await barsFor(cache, sym, tfs.trend);
        const isOwnReference = sym.asset_class === "CRYPTO_MAJOR" || sym.symbol === "SPY";
        const series = buildSetupSeries({
          entry,
          entryMs: TF_MS[tfs.entry],
          trend,
          trendMs: TF_MS[tfs.trend],
          market: isOwnReference ? undefined : await regimeDaily(sym),
        });
        const res = evaluateSetup(series, entry.length - 1, params);
        if (!res.triggered || !res.snapshot) continue;
        summary.triggers += 1;
        const snap = res.snapshot;
        const bucket = u.bucket_id ?? `${sym.asset_class}:UNKNOWN`;

        // Stage 4 — hard vetoes.
        const funding = isCrypto(sym.asset_class) ? await fetchFundingRate(sym.provider_symbol) : undefined;
        const vetoes = evaluateVetoes({
          symbol: sym.symbol,
          asset_class: sym.asset_class,
          mode,
          now: new Date(now),
          calendar: input.calendar,
          earnings_symbols: earnings,
          funding_rate: funding,
        });

        // Stage 2 — envelope on the account portfolio (correlation measured on daily returns, cross asset).
        const daily = await barsFor(cache, sym, "1d");
        const correlated: string[] = [];
        const correlations: Record<string, number | null> = {};
        for (const t of input.account.open) {
          const other = input.universe.find((x) => x.symbol === t.symbol);
          if (!other) continue;
          const od = await barsFor(cache, toSym(other), "1d");
          const rho = returnCorrelation(daily.map((b) => b.c), od.map((b) => b.c));
          correlations[t.symbol] = rho === null ? null : Math.round(rho * 100) / 100;
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
        // Stage 5 — stop from the chart, then size.
        const stopDistance = stopDistanceFor(snap.close, snap.atr, snap.swing_low, params);
        const basePlan = buildTradePlan({ entry: snap.close, stopDistance, equity: input.account.equity, assetClass: sym.asset_class, riskScale: settings.risk_scale });
        const deterministic = vetoes.length ? "VETO" : blocks.length || !basePlan ? "BLOCKED" : "ENTER";

        const { data: trig, error: trigErr } = await getSupabase()
          .from("trading_triggers")
          .upsert(
            {
              symbol: sym.symbol,
              asset_class: sym.asset_class,
              mode,
              bucket_id: bucket,
              bar_time: iso(last.t),
              snapshot: { ...snap, correlations, funding_rate: funding ?? null, vix, btc_dominance_pct: dominance },
              vetoes,
              envelope_blocks: blocks,
              plan: basePlan,
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

        if (vetoes.length || !basePlan) {
          summary.vetoed += vetoes.length ? 1 : 0;
          continue;
        }

        // Stage 6 — agent judgement (also recorded when the envelope blocks, for shadow measurement).
        let verdict: AgentVerdict | null = null;
        let flags: string[] = [];
        if (settings.agent_enabled && summary.agent_calls < MAX_AGENT_CALLS_PER_TICK) {
          summary.agent_calls += 1;
          const judged = await judgeTrigger({
            symbol: sym.symbol,
            asset_class: sym.asset_class,
            mode,
            bars: entry,
            snapshot: snap,
            plan: basePlan,
            history: historyCard(sym.symbol, bucket, closed),
            portfolio: {
              open_positions: input.account.open.map((t) => ({ symbol: t.symbol, state: t.state, open_risk_r: openRiskR(t.sim_state), correlation: correlations[t.symbol] ?? null })),
              open_risk_r: openRisk.reduce((s, p) => s + p.open_risk_r, 0),
              realized_r_today: input.account.realizedToday,
              realized_r_week: input.account.realizedWeek,
              drawdown_pct: drawdownFromPeak(input.account.equity, settings.peak_equity),
            },
            market: { super_regime_ok: snap.market_regime_ok, vix, btc_dominance_pct: dominance, headlines: [] },
          });
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
            injection_flags: flags,
          })
          .eq("id", triggerId);
        if (flags.length) {
          await logEvent({ kind: "INJECTION_FLAGGED", symbol: sym.symbol, severity: "warn", message: `${sym.symbol}: external text flagged (${flags.join(", ")})` });
        }

        const chart = entry.slice(-CHART_BARS_BEFORE);
        const base = { trigger_id: triggerId, sym, bucket, mode, barTime: last.t, snapshot: snap as unknown as Record<string, unknown>, verdict, params, chart };

        // Deterministic baseline — always simulated forward in shadow.
        await insertTrade({ ...base, track: "DETERMINISTIC", execution: "SHADOW", plan: basePlan });

        // Agent track — only in SHADOW/PAPER, only when the agent entered and the envelope allows.
        const multiplier = verdict ? verdict.risk_multiplier : 1;
        if (settings.phase === "BACKTEST" || multiplier === 0) continue;
        if (blocks.length) {
          summary.blocked += 1;
          continue;
        }
        const agentPlan = buildTradePlan({
          entry: snap.close,
          stopDistance,
          equity: input.account.equity,
          assetClass: sym.asset_class,
          riskScale: settings.risk_scale * multiplier,
        });
        if (!agentPlan) continue;
        const execution = settings.phase === "PAPER" && u.eligibility === "ACTIVE" ? "PAPER" : "SHADOW";
        await insertTrade({ ...base, track: "AGENT", execution, plan: agentPlan });
        summary.entries += 1;
        if (execution === "PAPER") {
          input.account.open.push({ symbol: sym.symbol, entry_limit: agentPlan.entry, remaining_size: agentPlan.size, state: "PENDING", sim_state: { state: "PENDING", entry_price: null, stop_price: agentPlan.stop } } as TradeRow);
          await logEvent({
            kind: "ORDER_PLACED",
            symbol: sym.symbol,
            message: `${sym.symbol}: Limit ${agentPlan.entry.toPrecision(6)} · סטופ ${agentPlan.stop.toPrecision(6)} · ×${multiplier} · ${verdict?.primary_reasoning ?? "deterministic"}`.slice(0, 300),
            push: true,
          });
        }
      } catch (err) {
        summary.errors.push(`scan ${u.symbol} ${mode}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}

// ── Tick ───────────────────────────────────────────────────────────────────

export async function runTick(now = Date.now()): Promise<TickSummary> {
  const started = Date.now();
  await ensureSeeded();
  let settings = await getSettings();
  const summary: TickSummary = { phase: settings.phase, positions_updated: 0, closed: 0, triggers: 0, entries: 0, vetoed: 0, blocked: 0, agent_calls: 0, screened: false, errors: [] };
  const cache = createBarCache(now);
  const universeRows = await getUniverse();
  const universe = new Map(universeRows.map((u) => [u.symbol, u]));
  const { params } = await getActiveParams();
  const today = new Date(now).toISOString().slice(0, 10);
  const calendar = await getCalendar(new Date(now - 2 * 86_400_000).toISOString().slice(0, 10));

  // Deferred risk-scale raise (friction): applies only after its cooldown.
  if (settings.pending_risk_scale !== null && settings.pending_risk_scale_at && Date.parse(settings.pending_risk_scale_at) <= now) {
    await updateSettings({ risk_scale: settings.pending_risk_scale, pending_risk_scale: null, pending_risk_scale_at: null });
    await logEvent({ kind: "RISK_SCALE", message: `הגדלת סיכון נכנסה לתוקף: ×${settings.pending_risk_scale}`, severity: "warn", push: true });
    settings = await getSettings();
  }

  const openTrades = await getOpenTrades();
  const lastPrices = new Map<string, number>();
  const earningsNext = openTrades.some((t) => t.asset_class === "STOCK")
    ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 2))
    : new Set<string>();
  await advancePositions({ trades: openTrades, cache, universe, params, calendar, earningsNext, agentEnabled: settings.agent_enabled, now, summary, lastPrices });

  const stillOpen = openTrades.filter((t) => t.state === "PENDING" || t.state === "OPEN" || t.state === "RISK_FREE");
  const account = await loadAccount(settings, stillOpen, lastPrices, now);
  const peak = Math.max(settings.peak_equity, account.equity);

  // Master kill switch — full stop, manual re-arm only.
  if (!settings.kill_switch_active && shouldTripKillSwitch(account.equity, peak)) {
    for (const t of account.open) {
      const p = { ...t.sim_state };
      const ev: PositionEvent[] = forceClose(p, lastPrices.get(t.symbol) ?? p.entry_price ?? p.entry_limit, "KILL_SWITCH", now);
      await updateTrade(t.id, {
        ...simColumns(p),
        events: [...(t.events ?? []), ...ev],
        ...(p.state === "CLOSED" ? { realized_r: realizedR(p), realized_pnl: p.cash_flow } : {}),
      });
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
    await scan({ settings, universe: universeRows, params, cache, calendar, account, openTrades: stillOpen, now, started, summary });
  }

  await getSupabase()
    .from("trading_equity_snapshots")
    .upsert(
      {
        day: today,
        equity: Math.round(account.equity * 100) / 100,
        peak_equity: Math.round(peak * 100) / 100,
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

export { dailyBelowEma200 };
