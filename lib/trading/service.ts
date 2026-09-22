import { getSupabase } from "@/lib/supabase";
import { EXECUTION_RULES, LEARNING_RULES, PAPER_STARTING_EQUITY, RISK_ENVELOPE, SEED_UNIVERSE } from "./config";
import { downsample, runBacktestV2, type V2Result } from "./strategy/backtest-v2";
import { DEFAULT_V2_PARAMS, type StrategyV2Params } from "./strategy/candidates";
import { loadFramesV2, warmStart } from "./strategy/data-v2";
import { backtestGate, nextPhase, paperGate, PHASE_ORDER, shadowGate, type BacktestGateInput, type GateCheck } from "./gates";
import { agentValueReport, bucketStats, runCalibration, walkForwardStability, type AgentValueReport } from "./learning";
import { createBarCache } from "./market-data";
import { alpaca, flattenAtBroker, isAlpacaConfigured } from "./broker/alpaca";
import { computeStats, equityCurveR, groupStats, rDistribution, ratingValue, type GroupStat, type PerformanceStats, type RatingValue } from "./metrics";
import { forceClose, openRiskR, realizedR } from "./position";
import { equityFromTrades } from "./account-equity";
import { applyRiskScaleRequest, drawdownFromPeak, haltStatus, weekStartIso } from "./risk-envelope";
import {
  getActiveV2Params,
  getActivePlaybook,
  listLessons,
  listPlaybooks,
  setPlaybookStatus,
  getCalendar,
  getClosedTrades,
  getOpenTrades,
  getSettings,
  getUniverse,
  isAccountTrade,
  logEvent,
  normalizeTrade,
  simColumns,
  toJournalTrade,
  updateSettings,
  updateTrade,
  type TradeRow,
  type TradingSettings,
  type UniverseRow,
} from "./store";
import type { TradingPhase, UniverseSymbol } from "./types";

/** Read models + commands shared by the REST API and the trading chat. */

const iso = (ms: number) => new Date(ms).toISOString();
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

// ── Dashboard ──────────────────────────────────────────────────────────────

export type LivePosition = {
  id: string;
  symbol: string;
  asset_class: string;
  mode: string;
  track: string;
  execution: string;
  state: string;
  entry_price: number | null;
  entry_limit: number;
  stop_price: number;
  target_price: number;
  last_price: number | null;
  current_r: number | null;
  distance_to_stop_pct: number | null;
  distance_to_target_pct: number | null;
  exit_plan: string | null;
  open_risk_r: number;
  agent_risk_multiplier: number | null;
  opened_at: string | null;
  trigger_timestamp: string;
  broker: string | null;
  broker_status: string | null;
  baseline_enter: boolean;
};

export type TriggerRow = {
  id: string;
  symbol: string;
  asset_class: string;
  mode: string;
  bar_time: string;
  vetoes: string[];
  envelope_blocks: string[];
  deterministic_decision: string;
  agent_decision: string | null;
  agent_conviction: number | null;
  agent_risk_multiplier: number | null;
  agent_reasoning: string | null;
  agent_key_risks: string[] | null;
  agent_confidence: string | null;
  agent_error: string | null;
  injection_flags: string[];
  setup: string | null;
  score: number | null;
  agent_market_read: string | null;
  agent_thesis: string | null;
  agent_invalidation: string | null;
  agent_target_index: number | null;
  agent_lessons_applied: string[] | null;
  baseline_enter: boolean;
  strategy_version: string;
  agent_rating: number | null;
  agent_rating_explanation: string | null;
  snapshot: Record<string, unknown>;
  plan: Record<string, unknown> | null;
  phase: string;
  created_at: string;
};

export type TradingEvent = { id: string; kind: string; severity: string; symbol: string | null; message: string; created_at: string };

export type PhaseGateView = { phase: TradingPhase; next: TradingPhase | null; checks: GateCheck[]; passes: boolean; days_in_phase: number };

export type DashboardPayload = {
  settings: TradingSettings;
  params: StrategyV2Params;
  params_locked_until: string | null;
  account: {
    equity: number;
    starting_equity: number;
    peak_equity: number;
    drawdown_pct: number;
    open_risk_r: number;
    pnl_day: number;
    pnl_week: number;
    pnl_month: number;
    r_day: number;
    r_week: number;
    r_month: number;
    halted_daily: boolean;
    halted_weekly: boolean;
    kill_switch_distance_pct: number;
  };
  positions: LivePosition[];
  /** Open but outside the account for this phase (e.g. leftover SHADOW rows). */
  other_positions: LivePosition[];
  shadow_open: number;
  triggers: TriggerRow[];
  events: TradingEvent[];
  gate: PhaseGateView;
  equity_history: { day: string; equity: number; open_risk_r: number }[];
  envelope: typeof RISK_ENVELOPE;
  execution_rules: typeof EXECUTION_RULES;
  broker: BrokerStatus;
};

export type BrokerStatus = {
  configured: boolean;
  venue: "SIM" | "ALPACA_PAPER";
  connected: boolean;
  equity: number | null;
  cash: number | null;
  error: string | null;
};

export async function getBrokerStatus(venue: "SIM" | "ALPACA_PAPER"): Promise<BrokerStatus> {
  if (!isAlpacaConfigured()) return { configured: false, venue, connected: false, equity: null, cash: null, error: null };
  try {
    const a = await alpaca.account();
    return { configured: true, venue, connected: !a.trading_blocked && !a.account_blocked, equity: Number(a.equity), cash: Number(a.cash), error: a.trading_blocked ? "trading_blocked" : null };
  } catch (err) {
    return { configured: true, venue, connected: false, equity: null, cash: null, error: err instanceof Error ? err.message.slice(0, 160) : "error" };
  }
}

async function lastPrices(trades: TradeRow[], universe: UniverseRow[]) {
  const cache = createBarCache();
  const out = new Map<string, number>();
  await Promise.all(
    [...new Set(trades.map((t) => t.symbol))].map(async (symbol) => {
      const u = universe.find((x) => x.symbol === symbol);
      if (!u) return;
      try {
        const bars = await cache.get(u, "1h", 6);
        const last = bars.at(-1);
        if (last) out.set(symbol, last.c);
      } catch {
        /* price unavailable — shown as null */
      }
    })
  );
  return out;
}

export async function getTriggers(opts: { limit?: number; symbol?: string } = {}): Promise<TriggerRow[]> {
  let q = getSupabase().from("trading_triggers").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 30);
  if (opts.symbol) q = q.eq("symbol", opts.symbol.toUpperCase());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...(r as TriggerRow), agent_risk_multiplier: r.agent_risk_multiplier === null ? null : Number(r.agent_risk_multiplier) }));
}

export async function getEvents(limit = 30): Promise<TradingEvent[]> {
  const { data } = await getSupabase().from("trading_events").select("id, kind, severity, symbol, message, created_at").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as TradingEvent[];
}

async function latestBacktestGateInput(): Promise<(BacktestGateInput & { id: string }) | null> {
  const { data } = await getSupabase().from("trading_backtests").select("id, gate, created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const g = (data as { id: string; gate: BacktestGateInput } | null)?.gate;
  return g && data ? { ...g, id: (data as { id: string }).id } : null;
}

async function reviewed(kind: string, since: string) {
  const { count } = await getSupabase().from("trading_events").select("id", { count: "exact", head: true }).eq("kind", `GATE_REVIEW:${kind}`).gte("created_at", since);
  return (count ?? 0) > 0;
}

export async function computePhaseGate(settings: TradingSettings, closed?: TradeRow[]): Promise<PhaseGateView> {
  const days = Math.floor((Date.now() - Date.parse(settings.phase_started_at)) / 86_400_000);
  const next = nextPhase(settings.phase);
  let checks: GateCheck[] = [];
  if (settings.phase === "BACKTEST") {
    checks = backtestGate(await latestBacktestGateInput());
  } else if (settings.phase === "SHADOW") {
    const trades = (closed ?? (await getClosedTrades())).filter((t) => t.closed_at && t.closed_at >= settings.phase_started_at);
    checks = shadowGate({
      agent: agentValueReport(trades.map(toJournalTrade)),
      days_in_phase: days,
      reasoning_reviewed: await reviewed("reasoning_reviewed", settings.phase_started_at),
    });
  } else if (settings.phase === "PAPER") {
    const trades = (closed ?? (await getClosedTrades())).filter((t) => t.closed_at && t.closed_at >= settings.phase_started_at && isAccountTrade(t, "PAPER"));
    const bt = await latestBacktestGateInput();
    const { count } = await getSupabase()
      .from("trading_events")
      .select("id", { count: "exact", head: true })
      .eq("severity", "critical")
      .gte("created_at", iso(Date.now() - 14 * 86_400_000));
    checks = paperGate({
      days_in_phase: days,
      paper_stats: computeStats(trades.map((t) => ({ r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at!) }))),
      backtest_expectancy_r: bt?.stats.expectancy_r ?? null,
      critical_events_14d: count ?? 0,
      survived_outage_reviewed: await reviewed("resilience_reviewed", settings.phase_started_at),
    });
  } else {
    checks = [{ id: "live", ok: false, detail: "LIVE — final phase. Scale 0.25% → 0.5% → 1%, three profitable months per step." }];
  }
  return { phase: settings.phase, next, checks, passes: checks.length > 0 && checks.every((c) => c.ok), days_in_phase: days };
}

export async function getDashboard(): Promise<DashboardPayload> {
  // Settings first: every consumer of `closed` below — the P&L sums, the
  // positions table and computePhaseGate — discards anything closed before
  // phase_started_at, so the phase bound belongs in the query rather than in a
  // JS filter over every closed trade ever recorded.
  const settings = await getSettings();
  const [open, closed, universe, triggers, events, active] = await Promise.all([
    getOpenTrades(),
    getClosedTrades({ sinceIso: settings.phase_started_at }),
    getUniverse(),
    getTriggers({ limit: 25 }),
    getEvents(30),
    getActiveV2Params(),
  ]);
  const accountOpen = open.filter((t) => isAccountTrade(t, settings.phase));
  // Open trades that are not part of the account in this phase — typically
  // SHADOW rows left over from an earlier phase. They do not count toward
  // equity, but they are still open and the user must be able to see and close
  // them; until now they were filtered out of the dashboard entirely, which
  // left them invisible in the app and untouched by close_all.
  const otherOpen = open.filter((t) => !isAccountTrade(t, settings.phase));
  const prices = await lastPrices(open, universe);
  const accountClosed = closed.filter((t) => isAccountTrade(t, settings.phase) && t.closed_at && t.closed_at >= settings.phase_started_at);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const week = weekStartIso(now);
  const month = today.slice(0, 7);
  const sumBy = (pred: (t: TradeRow) => boolean) => {
    const list = accountClosed.filter(pred);
    return { pnl: round(list.reduce((s, t) => s + (t.realized_pnl ?? 0), 0), 2), r: round(list.reduce((s, t) => s + (t.realized_r ?? 0), 0), 3) };
  };
  const d = sumBy((t) => t.closed_at!.slice(0, 10) === today);
  const w = sumBy((t) => weekStartIso(new Date(t.closed_at!)) === week);
  const m = sumBy((t) => t.closed_at!.slice(0, 7) === month);

  const toLivePosition = (t: TradeRow): LivePosition => {
    const p = t.sim_state;
    const last = prices.get(t.symbol) ?? null;
    const entry = p.entry_price;
    return {
      id: t.id,
      symbol: t.symbol,
      asset_class: t.asset_class,
      mode: t.mode,
      track: t.track,
      execution: t.execution,
      state: t.state,
      entry_price: entry,
      entry_limit: t.entry_limit,
      stop_price: p.stop_price,
      target_price: p.target_price,
      last_price: last,
      current_r: entry !== null && last !== null && p.stop_distance > 0 ? round((last - entry) / p.stop_distance, 2) : null,
      distance_to_stop_pct: last !== null ? round((last - p.stop_price) / last) : null,
      distance_to_target_pct: last !== null && p.exit_plan !== "TRAIL_2ATR" ? round((p.target_price - last) / last) : null,
      exit_plan: p.exit_plan,
      open_risk_r: openRiskR(p),
      agent_risk_multiplier: t.agent_risk_multiplier,
      opened_at: t.opened_at,
      trigger_timestamp: t.trigger_timestamp,
      broker: t.broker,
      broker_status: t.broker_status,
      baseline_enter: t.baseline_enter,
    };
  };
  const positions: LivePosition[] = accountOpen.map(toLivePosition);
  const otherPositions: LivePosition[] = otherOpen.map(toLivePosition);
  const equity = equityFromTrades(settings, accountOpen, accountClosed, prices);
  const peak = Math.max(settings.peak_equity, equity);
  const dd = drawdownFromPeak(equity, peak);
  const halts = haltStatus({ realized_r_today: d.r, realized_r_week: w.r });
  const { data: snaps } = await getSupabase().from("trading_equity_snapshots").select("day, equity, open_risk_r").order("day", { ascending: true }).limit(400);

  return {
    settings,
    params: active.params,
    params_locked_until: active.locked_until,
    account: {
      equity,
      starting_equity: settings.starting_equity,
      peak_equity: peak,
      drawdown_pct: round(dd),
      open_risk_r: positions.reduce((s, p) => s + p.open_risk_r, 0),
      pnl_day: d.pnl,
      pnl_week: w.pnl,
      pnl_month: m.pnl,
      r_day: d.r,
      r_week: w.r,
      r_month: m.r,
      halted_daily: halts.daily,
      halted_weekly: halts.weekly,
      kill_switch_distance_pct: round(Math.max(0, RISK_ENVELOPE.MASTER_KILL_SWITCH_DD - dd)),
    },
    positions,
    other_positions: otherPositions,
    shadow_open: open.length - accountOpen.length,
    triggers,
    events,
    gate: await computePhaseGate(settings, closed),
    equity_history: ((snaps ?? []) as { day: string; equity: number; open_risk_r: number }[]).map((s) => ({ day: s.day, equity: Number(s.equity), open_risk_r: Number(s.open_risk_r) })),
    envelope: RISK_ENVELOPE,
    execution_rules: EXECUTION_RULES,
    broker: await getBrokerStatus(settings.execution_venue),
  };
}

// ── Journal ────────────────────────────────────────────────────────────────

export type TradeFilters = {
  execution?: string;
  track?: string;
  state?: "open" | "closed" | "all";
  symbol?: string;
  outcome?: "win" | "loss" | "breakeven";
  limit?: number;
};

export type TradeListItem = Omit<TradeRow, "sim_state" | "chart_bars" | "events" | "trigger_snapshot">;

export async function listTrades(f: TradeFilters): Promise<TradeListItem[]> {
  let q = getSupabase()
    .from("trading_trades")
    .select(
      "id, trigger_id, symbol, asset_class, bucket_id, mode, track, execution, state, trigger_timestamp, agent_decision, agent_conviction, agent_risk_multiplier, agent_reasoning, agent_model_version, prompt_version, param_version, entry_limit, entry_price, stop_price, initial_stop_price, target_price, position_size, remaining_size, risk_amount, entry_slippage_bps, exit_plan, trail_stop, reached_1r, partial_exit_price, exit_price, exit_reason, gapped_through_stop, realized_r, realized_pnl, fees_paid, last_bar_time, mfe_r, mae_r, notes, tags, self_rating, setup, score, strategy_version, lesson_id, broker, broker_status, baseline_enter, agent_rating, agent_rating_explanation, opened_at, closed_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(f.limit ?? 200, 1000));
  if (f.execution) q = q.eq("execution", f.execution);
  if (f.track) q = q.eq("track", f.track);
  if (f.symbol) q = q.eq("symbol", f.symbol.toUpperCase());
  if (f.state === "open") q = q.in("state", ["PENDING", "OPEN", "RISK_FREE"]);
  if (f.state === "closed") q = q.eq("state", "CLOSED");
  if (f.outcome === "win") q = q.gt("realized_r", 0.6);
  if (f.outcome === "loss") q = q.lt("realized_r", 0);
  if (f.outcome === "breakeven") q = q.gte("realized_r", 0).lte("realized_r", 0.6);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => normalizeTrade(r as Record<string, unknown>));
}

export async function getTradeDetail(id: string) {
  const sb = getSupabase();
  const { data, error } = await sb.from("trading_trades").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const trade = normalizeTrade(data as Record<string, unknown>);
  let trigger: TriggerRow | null = null;
  let sibling: TradeListItem | null = null;
  if (trade.trigger_id) {
    const { data: trig } = await sb.from("trading_triggers").select("*").eq("id", trade.trigger_id).maybeSingle();
    trigger = (trig as TriggerRow) ?? null;
    const { data: sib } = await sb.from("trading_trades").select("*").eq("trigger_id", trade.trigger_id).neq("id", id).maybeSingle();
    sibling = sib ? normalizeTrade(sib as Record<string, unknown>) : null;
  }
  let lesson: import("./store").LessonRow | null = null;
  if (trade.lesson_id) {
    const { data: l } = await sb.from("trading_lessons").select("*").eq("id", trade.lesson_id).maybeSingle();
    lesson = (l as import("./store").LessonRow) ?? null;
  }
  return { trade, trigger, sibling, lesson };
}

export async function patchTradeJournal(id: string, patch: { notes?: string | null; tags?: string[]; self_rating?: number | null }) {
  const body: Record<string, unknown> = {};
  if (patch.notes !== undefined) body.notes = patch.notes?.slice(0, 5000) ?? null;
  if (patch.tags !== undefined) body.tags = patch.tags.map((t) => t.trim()).filter(Boolean).slice(0, 12);
  if (patch.self_rating !== undefined) body.self_rating = patch.self_rating === null ? null : Math.max(1, Math.min(5, Math.round(patch.self_rating)));
  await updateTrade(id, body);
}

// ── Analytics ──────────────────────────────────────────────────────────────

export type AnalyticsPayload = {
  scope: { execution: string; track: string };
  stats: PerformanceStats;
  r_curve: { t: number; cum_r: number }[];
  r_distribution: { bin: number; count: number }[];
  by_symbol: GroupStat[];
  by_bucket: GroupStat[];
  by_asset_class: GroupStat[];
  by_exit_reason: GroupStat[];
  by_weekday: GroupStat[];
  by_hour_utc: GroupStat[];
  by_mode: GroupStat[];
  by_conviction: GroupStat[];
  by_setup: GroupStat[];
  by_score: GroupStat[];
  by_strategy: GroupStat[];
  /** Rating-only agent (intraday): does the 1–10 score predict realized R? */
  by_rating: GroupStat[];
  rating_value: RatingValue;
  target_extensions: number;
  avg_mfe_r: number;
  avg_mae_r: number;
  avg_hold_hours: number;
  total_fees: number;
  avg_slippage_bps: number | null;
  gaps_through_stop: number;
  agent_value: AgentValueReport;
  buckets: ReturnType<typeof bucketStats>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getAnalytics(scope: { execution?: string; track?: string; sinceIso?: string }): Promise<AnalyticsPayload> {
  const all = await getClosedTrades({ sinceIso: scope.sinceIso });
  const execution = scope.execution ?? "ALL";
  const track = scope.track ?? "AGENT";
  const list = all.filter((t) => (execution === "ALL" || t.execution === execution) && (track === "ALL" || t.track === track));
  const rt = list.map((t) => ({ ...t, r: t.realized_r ?? 0, closed_at: Date.parse(t.closed_at ?? t.created_at), reached_1r: t.reached_1r, exit_reason: t.exit_reason }));
  const avg = (xs: number[]) => (xs.length ? round(xs.reduce((s, x) => s + x, 0) / xs.length, 3) : 0);
  const slips = list.map((t) => t.entry_slippage_bps).filter((x): x is number => x !== null);
  return {
    scope: { execution, track },
    stats: computeStats(rt),
    r_curve: equityCurveR(rt),
    r_distribution: rDistribution(rt),
    by_symbol: groupStats(rt, (t) => t.symbol),
    by_bucket: groupStats(rt, (t) => t.bucket_id),
    by_asset_class: groupStats(rt, (t) => t.asset_class),
    by_exit_reason: groupStats(rt, (t) => t.exit_reason ?? "?"),
    by_weekday: groupStats(rt, (t) => WEEKDAYS[new Date(t.trigger_timestamp).getUTCDay()]),
    by_hour_utc: groupStats(rt, (t) => String(new Date(t.trigger_timestamp).getUTCHours()).padStart(2, "0")),
    by_mode: groupStats(rt, (t) => t.mode),
    by_conviction: groupStats(rt, (t) => (t.agent_conviction ? `conviction ${t.agent_conviction}` : "no agent")),
    by_setup: groupStats(rt, (t) => t.setup ?? "v1"),
    by_score: groupStats(rt, (t) => (t.score === null ? "?" : t.score >= 70 ? "70+" : t.score >= 60 ? "60-69" : "<60")),
    by_strategy: groupStats(rt, (t) => t.strategy_version ?? "v2"),
    by_rating: groupStats(
      rt.filter((t) => t.agent_rating !== null),
      (t) => (t.agent_rating! >= 8 ? "8-10" : t.agent_rating! >= 6 ? "6-7" : t.agent_rating! >= 4 ? "4-5" : "1-3")
    ),
    rating_value: ratingValue(list),
    target_extensions: list.filter((t) => (t.events ?? []).some((e) => e.type === "TARGET_EXTENDED")).length,
    avg_mfe_r: avg(list.map((t) => t.mfe_r)),
    avg_mae_r: avg(list.map((t) => t.mae_r)),
    avg_hold_hours: avg(list.filter((t) => t.opened_at && t.closed_at).map((t) => (Date.parse(t.closed_at!) - Date.parse(t.opened_at!)) / 3_600_000)),
    total_fees: round(list.reduce((s, t) => s + t.fees_paid, 0), 2),
    avg_slippage_bps: slips.length ? avg(slips) : null,
    gaps_through_stop: list.filter((t) => t.gapped_through_stop).length,
    agent_value: agentValueReport(all.map(toJournalTrade)),
    buckets: bucketStats(all.map(toJournalTrade)),
  };
}

// ── Backtests ──────────────────────────────────────────────────────────────

export type BacktestPreset = "CRYPTO" | "STOCKS" | "ALL";

export function presetSymbols(preset: BacktestPreset, explicit?: string[]): UniverseSymbol[] {
  if (explicit?.length) {
    const set = new Set(explicit.map((s) => s.toUpperCase()));
    return SEED_UNIVERSE.filter((s) => set.has(s.symbol));
  }
  if (preset === "CRYPTO") return SEED_UNIVERSE.filter((s) => s.asset_class !== "STOCK");
  if (preset === "STOCKS") return SEED_UNIVERSE.filter((s) => s.asset_class === "STOCK");
  return SEED_UNIVERSE;
}

const TRADES_KEPT_PER_VARIANT = 400;
/** Free hourly stock history is ~730 days; keep 30 days of margin. */
const STOCK_MAX_YEARS = 1.9;

/** Comparison variants stored with every run, so the value of each strategy component is visible. */
function backtestVariants(params: StrategyV2Params): { label: string; params: StrategyV2Params }[] {
  return [
    { label: "ACTIVE", params },
    { label: "NO_EXTENSION", params: { ...params, extension_enabled: false } },
    { label: "PARTIAL_50_AT_1R", params: { ...params, partial_fraction: 0.5 } },
    { label: "WITH_PULLBACK", params: { ...params, setups: ["BREAKOUT", "PULLBACK"] } },
  ];
}

export async function runAndStoreBacktest(input: { preset: BacktestPreset; symbols?: string[]; years: number }) {
  const started = Date.now();
  const { params } = await getActiveV2Params();
  const calendar = await getCalendar("2000-01-01");
  const symbols = presetSymbols(input.preset, input.symbols);
  const years = symbols.some((s) => s.asset_class === "STOCK") ? Math.min(input.years, STOCK_MAX_YEARS) : input.years;
  const since = Date.now() - years * 365 * 86_400_000;
  const { frames, reference, skipped } = await loadFramesV2(symbols, since);
  const start = warmStart(frames, since);
  const end = Date.now();
  const results: V2Result[] = backtestVariants(params).map((v) =>
    runBacktestV2({ frames, reference, params: v.params, starting_equity: PAPER_STARTING_EQUITY, start, end, calendar, label: v.label })
  );
  const primary = results[0];
  const wf = walkForwardStability({ frames, reference, start, end, startingEquity: PAPER_STARTING_EQUITY, calendar }, params);
  const gate: BacktestGateInput = {
    stats: primary.stats,
    return_pct: primary.return_pct,
    benchmark_return_pct: primary.benchmark_return_pct,
    sharpe: primary.sharpe,
    benchmark_sharpe: primary.benchmark_sharpe,
    max_dd_pct: primary.max_equity_dd_pct,
    benchmark_max_dd_pct: primary.benchmark_max_dd_pct,
    walk_forward_passes: wf.passes,
    oos_expectancy_r: wf.oos_expectancy_r,
    mc_dd_pct_p95: primary.monte_carlo.max_dd_pct_p95,
    mc_prob_kill: primary.monte_carlo.prob_kill_switch,
    created_at: Date.now(),
  };
  const stored = results.map((r) => ({ ...r, trades: r.trades.slice(-TRADES_KEPT_PER_VARIANT), equity_curve: downsample(r.equity_curve, 300) }));
  const { data, error } = await getSupabase()
    .from("trading_backtests")
    .insert({
      mode: "SWING",
      years,
      symbols: frames.map((f) => f.symbol),
      param_version: params.version,
      params,
      range_start: iso(start),
      range_end: iso(end),
      results: stored,
      walk_forward: wf,
      gate: { ...gate, checks: backtestGate(gate) },
      skipped,
      duration_ms: Date.now() - started,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logEvent({
    kind: "BACKTEST",
    message: `בקטסט ${input.preset} ${years}y: ${primary.stats.trades} עסקאות, תוחלת ${primary.stats.expectancy_r}R, Sharpe ${primary.sharpe}, שער ${backtestGate(gate).every((c) => c.ok) ? "עבר" : "לא עבר"}`,
  });
  return { id: (data as { id: string }).id };
}

export async function listBacktests() {
  const { data, error } = await getSupabase()
    .from("trading_backtests")
    .select("id, mode, years, symbols, param_version, range_start, range_end, gate, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBacktest(id: string) {
  const { data, error } = await getSupabase().from("trading_backtests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ── Calibration (quarterly, human-approved) ────────────────────────────────

export async function proposeCalibration(input: { preset: BacktestPreset; years: number }) {
  const { params } = await getActiveV2Params();
  const calendar = await getCalendar("2000-01-01");
  const symbols = presetSymbols(input.preset);
  const since = Date.now() - input.years * 365 * 86_400_000;
  const { frames, reference } = await loadFramesV2(symbols, since);
  const start = warmStart(frames, since);
  const cal = runCalibration({ frames, reference, start, end: Date.now(), startingEquity: PAPER_STARTING_EQUITY, calendar }, params);
  const { data, error } = await getSupabase()
    .from("trading_param_sets")
    .insert({
      version: `${cal.proposed.version}@${new Date().toISOString().slice(0, 10)}`,
      params: { ...cal.proposed, strategy: "v2" },
      status: "PROPOSED",
      evidence: { ...cal, preset: input.preset, years: input.years, symbols: frames.map((f) => f.symbol), current_version: params.version },
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await logEvent({ kind: "CALIBRATION_PROPOSED", severity: "warn", message: `הצעת כיול: ${cal.proposed.version} · OOS ${cal.oos_total_r}R מול נוכחי ${cal.current_oos_total_r}R`, push: true });
  return { id: (data as { id: string }).id, recommend: cal.recommend };
}

export async function listParamSets() {
  const { data } = await getSupabase().from("trading_param_sets").select("*").order("created_at", { ascending: false }).limit(20);
  return data ?? [];
}

export async function decideCalibration(id: string, approve: boolean) {
  const sb = getSupabase();
  const { data: row } = await sb.from("trading_param_sets").select("*").eq("id", id).maybeSingle();
  if (!row || (row as { status: string }).status !== "PROPOSED") throw new Error("not_proposed");
  if (!approve) {
    await sb.from("trading_param_sets").update({ status: "REJECTED", decided_at: iso(Date.now()) }).eq("id", id);
    await logEvent({ kind: "CALIBRATION_REJECTED", message: `כיול נדחה: ${(row as { version: string }).version}` });
    return;
  }
  const active = await getActiveV2Params();
  if (active.locked_until && Date.parse(active.locked_until) > Date.now()) throw new Error("params_locked_until_" + active.locked_until.slice(0, 10));
  await sb.from("trading_param_sets").update({ status: "RETIRED" }).eq("status", "ACTIVE");
  const lockedUntil = iso(Date.now() + LEARNING_RULES.CALIBRATION_LOCK_DAYS * 86_400_000);
  await sb.from("trading_param_sets").update({ status: "ACTIVE", decided_at: iso(Date.now()), locked_until: lockedUntil }).eq("id", id);
  await logEvent({ kind: "CALIBRATION_APPROVED", severity: "warn", message: `פרמטרים חדשים פעילים וננעלו עד ${lockedUntil.slice(0, 10)}: ${(row as { version: string }).version}`, push: true });
}

// ── Learning view (lessons + playbook) ─────────────────────────────────────

export async function getLearningView() {
  const [playbook, history, lessons] = await Promise.all([getActivePlaybook(), listPlaybooks(10), listLessons(40)]);
  return { playbook, history, lessons, defaults: DEFAULT_V2_PARAMS };
}

// ── Commands ───────────────────────────────────────────────────────────────

export type ControlCommand =
  | { action: "pause_entries" }
  | { action: "resume_entries" }
  | { action: "set_playbook"; version: number; status: "ACTIVE" | "DISABLED" }
  | { action: "start_demo" }
  | { action: "stop_demo" }
  | { action: "set_agent"; enabled: boolean }
  | { action: "set_risk_scale"; value: number }
  | { action: "close_position"; trade_id: string }
  | { action: "close_all" }
  | { action: "set_symbol_enabled"; symbol: string; enabled: boolean }
  | { action: "add_calendar_event"; kind: "CPI" | "FOMC" | "EARNINGS" | "TOKEN_UNLOCK" | "OTHER_MACRO"; date: string; symbol?: string | null; note?: string | null }
  | { action: "rearm_kill_switch"; phrase: string }
  | { action: "set_phase"; phase: TradingPhase }
  | { action: "mark_review"; key: "reasoning_reviewed" | "resilience_reviewed" };

/** Commands the chat may PROPOSE (always executed only after explicit confirmation in the app). */
export const CHAT_ALLOWED_ACTIONS = ["pause_entries", "resume_entries", "set_risk_scale", "close_position", "close_all", "set_symbol_enabled", "add_calendar_event"] as const;

export type CloseOutcome = {
  closed: string[];
  failed: { symbol: string; reason: string }[];
  /** Closed without a live price — exit price and P&L are approximate. */
  estimated: string[];
};

/**
 * Close positions on demand (manual close, or the kill switch).
 *
 * Three things this has to get right, each of which it previously got wrong:
 *
 *  - A failing broker call must not abort the whole operation, but it must also
 *    not mark the trade closed. `flattenAtBroker` was awaited with no catch, so
 *    one Alpaca error threw out of the loop: nothing after it closed, and the
 *    caller got a bare 409. Marking it closed anyway would be worse — our books
 *    would read flat against a position the broker still holds.
 *  - A missing market price must not make a position impossible to close. It
 *    used to throw `no_price_<symbol>`, which meant the manual exit — the
 *    escape hatch — stopped working exactly when data feeds are flaky. The
 *    fallback chain now matches the kill switch in engine.ts, and an estimated
 *    exit is recorded as an event so the P&L is not silently trusted.
 *  - One bad symbol must not silently strand the rest. Every trade is attempted
 *    and the caller is told exactly which closed and which did not.
 */
async function closeTrades(trades: TradeRow[], reason: "MANUAL" | "KILL_SWITCH"): Promise<CloseOutcome> {
  const universe = await getUniverse();
  const prices = await lastPrices(trades, universe);
  const now = Date.now();
  const out: CloseOutcome = { closed: [], failed: [], estimated: [] };

  for (const t of trades) {
    const p = { ...t.sim_state };
    let brokerPx: number | null = null;
    if (t.broker) {
      try {
        brokerPx = await flattenAtBroker(t);
      } catch (err) {
        const detail = err instanceof Error ? err.message.slice(0, 120) : "broker_error";
        out.failed.push({ symbol: t.symbol, reason: `broker_flatten_failed: ${detail}` });
        continue;
      }
    }

    const market = prices.get(t.symbol);
    const price = brokerPx ?? market ?? p.entry_price ?? p.entry_limit;
    const ev = forceClose(p, price, reason, now);
    const estimated = brokerPx === null && market === undefined && p.state !== "PENDING";

    try {
      await updateTrade(t.id, {
        ...simColumns(p),
        events: [...(t.events ?? []), ...ev],
        ...(p.state === "CLOSED" ? { realized_r: round(realizedR(p), 3), realized_pnl: round(p.cash_flow, 2) } : {}),
      });
      out.closed.push(t.symbol);
      if (estimated) out.estimated.push(t.symbol);
    } catch (err) {
      out.failed.push({ symbol: t.symbol, reason: err instanceof Error ? err.message.slice(0, 120) : "update_failed" });
    }
  }
  return out;
}

export async function executeCommand(cmd: ControlCommand, source: "app" | "chat"): Promise<{ ok: true; message: string }> {
  const settings = await getSettings();
  const now = Date.now();
  const audit = (message: string, severity: "info" | "warn" | "critical" = "info") =>
    logEvent({ kind: `CONTROL:${cmd.action}`, message: `${message} (${source})`, severity, data: cmd });

  switch (cmd.action) {
    case "pause_entries":
      await updateSettings({ entries_paused: true });
      await audit("כניסות חדשות הושהו", "warn");
      return { ok: true, message: "כניסות חדשות הושהו" };
    case "resume_entries":
      await updateSettings({ entries_paused: false });
      await audit("כניסות חדשות חודשו");
      return { ok: true, message: "כניסות חודשו" };
    case "start_demo": {
      // Demo = Alpaca PAPER account only (the adapter has no live endpoint). The user chose to skip the
      // backtest/shadow gates for demo money; the bypass is recorded. Real money stays gated.
      if (source !== "app") throw new Error("app_only");
      const broker = await getBrokerStatus("ALPACA_PAPER");
      if (!broker.configured) throw new Error("alpaca_not_configured");
      if (!broker.connected || broker.equity === null) throw new Error(`alpaca_not_connected:${broker.error ?? ""}`);
      await updateSettings({ phase: "PAPER", execution_venue: "ALPACA_PAPER", phase_started_at: iso(now), starting_equity: broker.equity, peak_equity: broker.equity, entries_paused: false });
      await audit(`מסחר דמו חי הופעל בחשבון Alpaca Paper ($${Math.round(broker.equity)}) — שערי בקטסט/צל עוקפו לדמו בלבד`, "critical");
      return { ok: true, message: "demo started" };
    }
    case "stop_demo":
      if (source !== "app") throw new Error("app_only");
      await updateSettings({ execution_venue: "SIM", entries_paused: true });
      await audit("מסחר דמו הושהה: כניסות חדשות עצורות, פוזיציות קיימות ממשיכות להיות מנוהלות", "warn");
      return { ok: true, message: "demo paused" };
    case "set_playbook":
      if (source !== "app") throw new Error("app_only");
      await setPlaybookStatus(cmd.version, cmd.status);
      await audit(`playbook v${cmd.version} → ${cmd.status}`, "warn");
      return { ok: true, message: `playbook v${cmd.version} ${cmd.status}` };
    case "set_agent":
      await updateSettings({ agent_enabled: cmd.enabled });
      await audit(`שכבת הסוכן ${cmd.enabled ? "הופעלה" : "כובתה"}`, "warn");
      return { ok: true, message: `agent ${cmd.enabled ? "on" : "off"}` };
    case "set_risk_scale": {
      const res = applyRiskScaleRequest({ current: settings.risk_scale, requested: cmd.value, now });
      if (res.pending) {
        await updateSettings({ pending_risk_scale: res.pending.value, pending_risk_scale_at: iso(res.pending.effective_at) });
        await audit(`בקשת הגדלת סיכון ל-×${res.pending.value} — תיכנס לתוקף ב-${iso(res.pending.effective_at).slice(0, 16)}`, "warn");
        return { ok: true, message: `הגדלה נדחתה ל-24 שעות (חיכוך מכוון)` };
      }
      await updateSettings({ risk_scale: res.scale, pending_risk_scale: null, pending_risk_scale_at: null });
      await audit(`סיכון הוקטן ל-×${res.scale}`);
      return { ok: true, message: `סיכון ×${res.scale}` };
    }
    case "close_position": {
      const open = await getOpenTrades();
      const t = open.find((x) => x.id === cmd.trade_id);
      if (!t) throw new Error("trade_not_open");
      const res = await closeTrades([t], "MANUAL");
      if (res.failed.length) {
        // The position is still open at the broker — say so rather than
        // reporting a close that did not happen.
        await audit(`סגירת ${t.symbol} נכשלה: ${res.failed[0].reason}`, "critical");
        throw new Error(res.failed[0].reason);
      }
      const approx = res.estimated.length ? " (מחיר יציאה משוער — אין ציטוט חי)" : "";
      await audit(`${t.symbol} נסגרה ידנית${approx}`, "warn");
      return { ok: true, message: `${t.symbol} closed${approx}` };
    }
    case "close_all": {
      const open = (await getOpenTrades()).filter((t) => isAccountTrade(t, settings.phase));
      const res = await closeTrades(open, "MANUAL");
      const approx = res.estimated.length ? ` · ${res.estimated.length} במחיר משוער` : "";
      if (res.failed.length) {
        // Partial success is the common case when one symbol's broker call
        // fails; the old code threw and told the caller nothing about the rest.
        const detail = res.failed.map((f) => `${f.symbol}: ${f.reason}`).join("; ");
        await audit(`${res.closed.length} נסגרו, ${res.failed.length} נכשלו — ${detail}`, "critical");
        return {
          ok: true,
          message: `${res.closed.length} closed${approx}, ${res.failed.length} failed: ${detail}`,
        };
      }
      await audit(`${res.closed.length} פוזיציות נסגרו ידנית${approx}`, "warn");
      return { ok: true, message: `${res.closed.length} closed${approx}` };
    }
    case "set_symbol_enabled":
      await getSupabase().from("trading_universe").update({ manual_enabled: cmd.enabled, updated_at: iso(now) }).eq("symbol", cmd.symbol.toUpperCase());
      await audit(`${cmd.symbol} ${cmd.enabled ? "הופעל" : "כובה"}`);
      return { ok: true, message: `${cmd.symbol} ${cmd.enabled ? "on" : "off"}` };
    case "add_calendar_event": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cmd.date)) throw new Error("invalid_date");
      await getSupabase().from("trading_calendar").insert({ kind: cmd.kind, date: cmd.date, symbol: cmd.symbol?.toUpperCase() ?? null, note: cmd.note ?? null, source: source });
      await audit(`אירוע ${cmd.kind} ${cmd.symbol ?? ""} ${cmd.date} נוסף`);
      return { ok: true, message: "calendar event added" };
    }
    case "rearm_kill_switch": {
      if (source !== "app") throw new Error("app_only");
      if (cmd.phrase !== "ARM") throw new Error("confirmation_phrase_required");
      const dash = await getDashboard();
      // Re-arming resets the peak to current equity, otherwise it would trip again instantly.
      await updateSettings({ kill_switch_active: false, kill_switch_reason: null, kill_switch_at: null, peak_equity: dash.account.equity, entries_paused: true });
      await audit("מפסק ראשי אותחל ידנית — כניסות נשארות מושהות עד חידוש ידני", "critical");
      return { ok: true, message: "kill switch re-armed; entries remain paused" };
    }
    case "set_phase": {
      if (source !== "app") throw new Error("app_only");
      const from = PHASE_ORDER.indexOf(settings.phase);
      const to = PHASE_ORDER.indexOf(cmd.phase);
      if (to < 0) throw new Error("invalid_phase");
      if (to > from) {
        if (to !== from + 1) throw new Error("cannot_skip_phase");
        const gate = await computePhaseGate(settings);
        if (!gate.passes) throw new Error("gate_not_passed");
      }
      await updateSettings({ phase: cmd.phase, phase_started_at: iso(now), peak_equity: settings.starting_equity });
      await audit(`שלב שונה: ${settings.phase} → ${cmd.phase}`, "critical");
      return { ok: true, message: `phase ${cmd.phase}` };
    }
    case "mark_review":
      await logEvent({ kind: `GATE_REVIEW:${cmd.key}`, message: `אישור ידני: ${cmd.key}` });
      return { ok: true, message: "review recorded" };
  }
}

export function parseCommand(body: Record<string, unknown>): ControlCommand | null {
  const a = body.action;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (a) {
    case "pause_entries":
    case "resume_entries":
    case "close_all":
      return { action: a };
    case "start_demo":
    case "stop_demo":
      return { action: a };
    case "set_playbook":
      return typeof body.version === "number" && (body.status === "ACTIVE" || body.status === "DISABLED") ? { action: a, version: body.version, status: body.status } : null;
    case "set_agent":
      return typeof body.enabled === "boolean" ? { action: a, enabled: body.enabled } : null;
    case "set_risk_scale":
      return typeof body.value === "number" && Number.isFinite(body.value) ? { action: a, value: body.value } : null;
    case "close_position":
      return s(body.trade_id) ? { action: a, trade_id: s(body.trade_id) } : null;
    case "set_symbol_enabled":
      return s(body.symbol) && typeof body.enabled === "boolean" ? { action: a, symbol: s(body.symbol), enabled: body.enabled } : null;
    case "add_calendar_event": {
      const kind = s(body.kind) as "CPI";
      if (!["CPI", "FOMC", "EARNINGS", "TOKEN_UNLOCK", "OTHER_MACRO"].includes(kind) || !s(body.date)) return null;
      return { action: a, kind, date: s(body.date), symbol: s(body.symbol) || null, note: s(body.note) || null };
    }
    case "rearm_kill_switch":
      return { action: a, phrase: s(body.phrase) };
    case "set_phase":
      return PHASE_ORDER.includes(body.phase as TradingPhase) ? { action: a, phase: body.phase as TradingPhase } : null;
    case "mark_review":
      return body.key === "reasoning_reviewed" || body.key === "resilience_reviewed" ? { action: a, key: body.key } : null;
    default:
      return null;
  }
}

export async function getUniverseView() {
  const [universe, calendar] = await Promise.all([getUniverse(), getCalendar(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))]);
  return { universe, calendar };
}
