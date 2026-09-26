import { getSupabase } from "@/lib/supabase";
import { EXECUTION_RULES, RISK_ENVELOPE } from "./config";
import type { StrategyV2Params } from "./strategy/candidates";
import { computePhaseGate, type PhaseGateView } from "./service-gates";
import { alpaca, isAlpacaConfigured } from "./broker/alpaca";
import { openRiskR } from "./position";
import { brokerEquity, computeLiveEquityWithPrices } from "./account-equity";
import { drawdownFromPeak, haltStatus, weekStartIso } from "./risk-envelope";
import { getActiveV2Params, getClosedTrades, getOpenTrades, getSettings, isAccountTrade, type TradeRow, type TradingSettings } from "./store";
import { round } from "./round";

/** The trading dashboard read model: equity, open positions, phase gate, recent activity. */

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
  /** 1R in price at the fill — what current R is measured against. */
  stop_distance: number | null;
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

export type DashboardOverview = {
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
  other_positions: LivePosition[];
  shadow_open: number;
  gate: PhaseGateView;
  equity_history: { day: string; equity: number; open_risk_r: number }[];
  envelope: typeof RISK_ENVELOPE;
  execution_rules: typeof EXECUTION_RULES;
};

export type DashboardPayload = DashboardOverview & {
  triggers: TriggerRow[];
  events: TradingEvent[];
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

const OFFLINE_BROKER = (venue: "SIM" | "ALPACA_PAPER"): BrokerStatus => ({
  configured: false,
  venue,
  connected: false,
  equity: null,
  cash: null,
  error: null,
});

export async function getBrokerStatus(venue: "SIM" | "ALPACA_PAPER"): Promise<BrokerStatus> {
  if (!isAlpacaConfigured()) return { configured: false, venue, connected: false, equity: null, cash: null, error: null };
  try {
    const a = await alpaca.account();
    // null rather than NaN when the figure is unusable: `advance_phase` copies
    // this into starting_equity and peak_equity, and a NaN peak reads as zero
    // drawdown forever (see brokerEquity).
    const equity = brokerEquity(a.equity);
    const cash = Number(a.cash);
    return {
      configured: true,
      venue,
      connected: !a.trading_blocked && !a.account_blocked,
      equity: equity.ok ? equity.equity : null,
      cash: Number.isFinite(cash) ? cash : null,
      error: a.trading_blocked ? "trading_blocked" : equity.ok ? null : equity.reason,
    };
  } catch (err) {
    return { configured: true, venue, connected: false, equity: null, cash: null, error: err instanceof Error ? err.message.slice(0, 160) : "error" };
  }
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

async function equitySnapshots() {
  const { data: snaps } = await getSupabase().from("trading_equity_snapshots").select("day, equity, open_risk_r").order("day", { ascending: true }).limit(400);
  return ((snaps ?? []) as { day: string; equity: number; open_risk_r: number }[]).map((s) => ({ day: s.day, equity: Number(s.equity), open_risk_r: Number(s.open_risk_r) }));
}

function toLivePosition(t: TradeRow, prices: Map<string, number>): LivePosition {
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
    stop_distance: p.stop_distance > 0 ? p.stop_distance : null,
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
}

/** Dashboard core — live equity uses the same marks as the equity endpoint. */
export async function getDashboardOverview(): Promise<DashboardOverview> {
  const settings = await getSettings();
  const [open, closed, active, live] = await Promise.all([
    getOpenTrades(),
    getClosedTrades({ sinceIso: settings.phase_started_at }),
    getActiveV2Params(),
    computeLiveEquityWithPrices(settings),
  ]);
  const accountOpen = open.filter((t) => isAccountTrade(t, settings.phase));
  const otherOpen = open.filter((t) => !isAccountTrade(t, settings.phase));
  const prices = live.prices;
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

  const positions = accountOpen.map((t) => toLivePosition(t, prices));
  const otherPositions = otherOpen.map((t) => toLivePosition(t, prices));
  const equity = live.equity;
  const peak = Math.max(settings.peak_equity, equity);
  const dd = drawdownFromPeak(equity, peak);
  const halts = haltStatus({ realized_r_today: d.r, realized_r_week: w.r });

  const [equity_history, gate] = await Promise.all([equitySnapshots(), computePhaseGate(settings, closed)]);

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
    gate,
    equity_history,
    envelope: RISK_ENVELOPE,
    execution_rules: EXECUTION_RULES,
  };
}

/** Full dashboard for chat/commands — composes overview + feed + optional broker. */
export async function getDashboard(opts?: { includeBroker?: boolean }): Promise<DashboardPayload> {
  const [overview, triggers, events, broker] = await Promise.all([
    getDashboardOverview(),
    getTriggers({ limit: 25 }),
    getEvents(30),
    opts?.includeBroker ? getBrokerStatus((await getSettings()).execution_venue) : Promise.resolve(null),
  ]);
  return {
    ...overview,
    triggers,
    events,
    broker: broker ?? OFFLINE_BROKER(overview.settings.execution_venue),
  };
}
