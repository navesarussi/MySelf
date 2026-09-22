import { getSupabase } from "@/lib/supabase";
import { EXECUTION_RULES, RISK_ENVELOPE } from "./config";
import type { StrategyV2Params } from "./strategy/candidates";
import { computePhaseGate, type PhaseGateView } from "./service-gates";
import { createBarCache } from "./market-data";
import { alpaca, isAlpacaConfigured } from "./broker/alpaca";
import { openRiskR } from "./position";
import { equityFromTrades } from "./account-equity";
import { drawdownFromPeak, haltStatus, weekStartIso } from "./risk-envelope";
import { getActiveV2Params, getClosedTrades, getOpenTrades, getSettings, getUniverse, isAccountTrade, type TradeRow, type TradingSettings, type UniverseRow } from "./store";
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

export async function lastPrices(trades: TradeRow[], universe: UniverseRow[]) {
  const cache = createBarCache();
  const out = new Map<string, number>();
  const { livePrice } = await import("./intraday-data");
  await Promise.all(
    [...new Set(trades.map((t) => t.symbol))].map(async (symbol) => {
      const u = universe.find((x) => x.symbol === symbol);
      if (!u) return;
      try {
        const bars = await cache.get(u, "1h", 6);
        const last = bars.at(-1);
        if (last) {
          out.set(symbol, last.c);
          return;
        }
      } catch {
        /* fall through to live quote */
      }
      const px = await livePrice({ symbol: u.symbol, asset_class: u.asset_class, provider_symbol: u.provider_symbol });
      if (px) out.set(symbol, px);
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
