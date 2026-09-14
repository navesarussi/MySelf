import { getSupabase } from "@/lib/supabase";
import { sendPush } from "@/lib/push/send";
import { PAPER_STARTING_EQUITY, SEED_UNIVERSE } from "./config";
import { FOMC_DATES } from "./calendar-seed";
import type { JournalTrade } from "./learning";
import { DEFAULT_V2_PARAMS, type StrategyV2Params } from "./strategy/candidates";
import type { PositionEvent, SimPosition } from "./position";
import type { AssetClass, Bar, ExitPlan, TradingMode, TradingPhase } from "./types";
import type { CalendarEvent } from "./veto";

/** Supabase persistence for the trading system. */

export type TradingSettings = {
  phase: TradingPhase;
  phase_started_at: string;
  entries_paused: boolean;
  risk_scale: number;
  pending_risk_scale: number | null;
  pending_risk_scale_at: string | null;
  kill_switch_active: boolean;
  kill_switch_reason: string | null;
  kill_switch_at: string | null;
  agent_enabled: boolean;
  starting_equity: number;
  peak_equity: number;
  last_tick_at: string | null;
  last_tick_summary: Record<string, unknown> | null;
  last_screen_date: string | null;
  last_daily_trend_scan_date: string | null;
  execution_venue: "SIM" | "ALPACA_PAPER";
  /** Per-minute intraday (15m/5m) strategy switch + its own heartbeat. */
  intraday_enabled: boolean;
  last_intraday_tick_at: string | null;
  last_intraday_summary: Record<string, unknown> | null;
  updated_at: string;
};

const num = (v: unknown, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getSettings(): Promise<TradingSettings> {
  const { data, error } = await getSupabase().from("trading_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(`trading_settings: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    phase: (r.phase as TradingPhase) ?? "BACKTEST",
    phase_started_at: String(r.phase_started_at ?? new Date().toISOString()),
    entries_paused: Boolean(r.entries_paused),
    risk_scale: num(r.risk_scale, 1),
    pending_risk_scale: numOrNull(r.pending_risk_scale),
    pending_risk_scale_at: (r.pending_risk_scale_at as string) ?? null,
    kill_switch_active: Boolean(r.kill_switch_active),
    kill_switch_reason: (r.kill_switch_reason as string) ?? null,
    kill_switch_at: (r.kill_switch_at as string) ?? null,
    agent_enabled: r.agent_enabled === undefined ? true : Boolean(r.agent_enabled),
    starting_equity: num(r.starting_equity, PAPER_STARTING_EQUITY),
    peak_equity: num(r.peak_equity, PAPER_STARTING_EQUITY),
    last_tick_at: (r.last_tick_at as string) ?? null,
    last_tick_summary: (r.last_tick_summary as Record<string, unknown>) ?? null,
    last_screen_date: (r.last_screen_date as string) ?? null,
    last_daily_trend_scan_date: (r.last_daily_trend_scan_date as string) ?? null,
    execution_venue: r.execution_venue === "ALPACA_PAPER" ? "ALPACA_PAPER" : "SIM",
    intraday_enabled: Boolean(r.intraday_enabled),
    last_intraday_tick_at: (r.last_intraday_tick_at as string) ?? null,
    last_intraday_summary: (r.last_intraday_summary as Record<string, unknown>) ?? null,
    updated_at: String(r.updated_at ?? new Date().toISOString()),
  };
}

export async function updateSettings(patch: Partial<TradingSettings>) {
  const { error } = await getSupabase()
    .from("trading_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(`trading_settings update: ${error.message}`);
}

export async function logEvent(input: { kind: string; message: string; severity?: "info" | "warn" | "critical"; symbol?: string | null; data?: unknown; push?: boolean }) {
  await getSupabase()
    .from("trading_events")
    .insert({ kind: input.kind, message: input.message, severity: input.severity ?? "info", symbol: input.symbol ?? null, data: input.data ?? null });
  if (input.push) {
    await sendPush({ title: `מסחר · ${input.kind}`, body: input.message, data: { url: "/trading" } }).catch(() => undefined);
  }
}

export async function ensureSeeded() {
  const sb = getSupabase();
  await sb.from("trading_universe").upsert(
    SEED_UNIVERSE.map((s) => ({ symbol: s.symbol, asset_class: s.asset_class, provider_symbol: s.provider_symbol })),
    { onConflict: "symbol", ignoreDuplicates: true }
  );
  const { count } = await sb.from("trading_calendar").select("id", { count: "exact", head: true }).eq("source", "seed");
  if (!count) {
    await sb.from("trading_calendar").insert(FOMC_DATES.map((e) => ({ kind: e.kind, date: e.date, symbol: e.symbol, source: "seed" })));
  }
}

export type UniverseRow = {
  symbol: string;
  asset_class: AssetClass;
  provider_symbol: string;
  manual_enabled: boolean;
  screen_passed: boolean;
  screen_failures: string[];
  eligibility: "ACTIVE" | "DISABLED_POOR" | "REVIEW_SIM";
  eligibility_changed_at: string | null;
  eligibility_note: string | null;
  bucket_id: string | null;
  metrics: Record<string, unknown> | null;
  last_screened_at: string | null;
};

export async function getUniverse(): Promise<UniverseRow[]> {
  const { data, error } = await getSupabase().from("trading_universe").select("*").order("asset_class").order("symbol");
  if (error) throw new Error(`trading_universe: ${error.message}`);
  return (data ?? []) as UniverseRow[];
}

/** Active strategy v2 params: an approved param set tagged `strategy: "v2"`, else research defaults. */
export async function getActiveV2Params(): Promise<{ params: StrategyV2Params; locked_until: string | null; id: string | null }> {
  const { data } = await getSupabase().from("trading_param_sets").select("*").eq("status", "ACTIVE").maybeSingle();
  const row = data as { id: string; version: string; params: Record<string, unknown>; locked_until: string | null } | null;
  if (!row || row.params.strategy !== "v2") return { params: DEFAULT_V2_PARAMS, locked_until: row?.locked_until ?? null, id: null };
  const { strategy: _s, ...rest } = row.params;
  return { params: { ...DEFAULT_V2_PARAMS, ...(rest as object), version: row.version }, locked_until: row.locked_until, id: row.id };
}

export async function getCalendar(fromIso: string): Promise<(CalendarEvent & { id: string; note: string | null; source: string })[]> {
  const { data, error } = await getSupabase().from("trading_calendar").select("*").gte("date", fromIso).order("date");
  if (error) throw new Error(`trading_calendar: ${error.message}`);
  return (data ?? []) as (CalendarEvent & { id: string; note: string | null; source: string })[];
}

// ── Trades ────────────────────────────────────────────────────────────────

export type TradeRow = {
  id: string;
  trigger_id: string | null;
  symbol: string;
  asset_class: AssetClass;
  bucket_id: string;
  mode: TradingMode;
  track: "DETERMINISTIC" | "AGENT";
  execution: "SHADOW" | "PAPER" | "LIVE";
  state: SimPosition["state"];
  trigger_timestamp: string;
  trigger_snapshot: Record<string, unknown>;
  agent_decision: string;
  agent_conviction: number | null;
  agent_risk_multiplier: number | null;
  agent_reasoning: string | null;
  agent_model_version: string;
  prompt_version: string;
  param_version: string;
  entry_limit: number;
  entry_price: number | null;
  stop_price: number;
  initial_stop_price: number;
  target_price: number;
  position_size: number;
  remaining_size: number;
  risk_amount: number;
  entry_slippage_bps: number | null;
  exit_plan: ExitPlan | null;
  trail_stop: number | null;
  reached_1r: boolean;
  partial_exit_price: number | null;
  exit_price: number | null;
  exit_reason: string | null;
  gapped_through_stop: boolean;
  realized_r: number | null;
  realized_pnl: number | null;
  fees_paid: number;
  sim_state: SimPosition;
  last_bar_time: string | null;
  mfe_r: number;
  mae_r: number;
  chart_bars: Bar[] | null;
  events: (PositionEvent & { note?: string })[];
  notes: string | null;
  tags: string[];
  self_rating: number | null;
  setup: string | null;
  score: number | null;
  strategy_version: string | null;
  lesson_id: string | null;
  broker: "ALPACA_PAPER" | null;
  broker_entry_order_id: string | null;
  broker_stop_order_id: string | null;
  broker_target_order_id: string | null;
  broker_status: string | null;
  broker_filled_qty: number | null;
  baseline_enter: boolean;
  /** Rating-only agent (intraday): 1–10 + short explanation; never affects the trade. */
  agent_rating: number | null;
  agent_rating_explanation: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

const NUMERIC_TRADE_FIELDS = [
  "agent_risk_multiplier",
  "entry_limit",
  "entry_price",
  "stop_price",
  "initial_stop_price",
  "target_price",
  "position_size",
  "remaining_size",
  "risk_amount",
  "trail_stop",
  "partial_exit_price",
  "exit_price",
  "realized_r",
  "realized_pnl",
  "fees_paid",
  "mfe_r",
  "mae_r",
] as const;

export function normalizeTrade(row: Record<string, unknown>): TradeRow {
  const out = { ...row } as Record<string, unknown>;
  for (const f of NUMERIC_TRADE_FIELDS) out[f] = numOrNull(row[f]);
  return out as TradeRow;
}

/** Denormalised columns mirrored from the simulator state. */
export function simColumns(p: SimPosition) {
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  return {
    state: p.state,
    entry_price: p.entry_price,
    stop_price: p.stop_price,
    target_price: p.target_price,
    remaining_size: p.size,
    entry_slippage_bps: p.entry_slippage_bps,
    exit_plan: p.exit_plan,
    trail_stop: p.trail_stop,
    reached_1r: p.reached_1r,
    partial_exit_price: p.partial_exit_price,
    exit_price: p.exit_price,
    exit_reason: p.exit_reason ?? (p.state === "CANCELLED" ? p.cancel_reason : null),
    gapped_through_stop: p.gapped_through_stop,
    fees_paid: p.fees_paid,
    mfe_r: Math.round(p.mfe_r * 1000) / 1000,
    mae_r: Math.round(p.mae_r * 1000) / 1000,
    opened_at: iso(p.opened_at),
    closed_at: iso(p.closed_at),
    sim_state: p,
  };
}

export async function getOpenTrades(): Promise<TradeRow[]> {
  const { data, error } = await getSupabase().from("trading_trades").select("*").in("state", ["PENDING", "OPEN", "RISK_FREE"]);
  if (error) throw new Error(`open trades: ${error.message}`);
  return (data ?? []).map((r) => normalizeTrade(r as Record<string, unknown>));
}

export async function getClosedTrades(opts: { sinceIso?: string; limit?: number } = {}): Promise<TradeRow[]> {
  let q = getSupabase().from("trading_trades").select("*").eq("state", "CLOSED").order("closed_at", { ascending: false }).limit(opts.limit ?? 5000);
  if (opts.sinceIso) q = q.gte("closed_at", opts.sinceIso);
  const { data, error } = await q;
  if (error) throw new Error(`closed trades: ${error.message}`);
  return (data ?? []).map((r) => normalizeTrade(r as Record<string, unknown>));
}

/** Closed trades without the heavy jsonb columns — enough for equity and halt accounting. */
export async function getClosedTradesLite(sinceIso: string): Promise<Pick<TradeRow, "id" | "track" | "execution" | "closed_at" | "realized_r" | "realized_pnl" | "created_at">[]> {
  const { data, error } = await getSupabase()
    .from("trading_trades")
    .select("id, track, execution, closed_at, realized_r, realized_pnl, created_at")
    .eq("state", "CLOSED")
    .gte("closed_at", sinceIso)
    .limit(20000);
  if (error) throw new Error(`closed trades: ${error.message}`);
  return (data ?? []).map((r) => ({ ...(r as Record<string, unknown>), realized_r: numOrNull((r as Record<string, unknown>).realized_r), realized_pnl: numOrNull((r as Record<string, unknown>).realized_pnl) }) as Pick<TradeRow, "id" | "track" | "execution" | "closed_at" | "realized_r" | "realized_pnl" | "created_at">);
}

export function toJournalTrade(t: TradeRow): JournalTrade {
  return {
    id: t.id,
    trigger_id: t.trigger_id,
    symbol: t.symbol,
    bucket_id: t.bucket_id,
    track: t.track,
    execution: t.execution,
    realized_r: t.realized_r ?? 0,
    agent_risk_multiplier: t.agent_risk_multiplier,
    agent_conviction: t.agent_conviction,
    reached_1r: t.reached_1r,
    closed_at: t.closed_at ? Date.parse(t.closed_at) : 0,
    baseline_enter: t.baseline_enter ?? true,
  };
}

/**
 * The "account" whose equity sizes positions and trips breakers: the agent track, which is the
 * only track that respects the portfolio envelope. In SHADOW it is a virtual account; in PAPER, paper.
 * The DETERMINISTIC track is a pure signal-quality baseline and never constrained by the portfolio.
 */
export function isAccountTrade(t: Pick<TradeRow, "track" | "execution">, phase: TradingPhase) {
  if (t.track !== "AGENT") return false;
  if (phase === "PAPER" || phase === "LIVE") return t.execution === "PAPER" || t.execution === "LIVE";
  return t.execution === "SHADOW";
}

export async function updateTrade(id: string, patch: Record<string, unknown>) {
  const { error } = await getSupabase()
    .from("trading_trades")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`update trade: ${error.message}`);
}

// ── Lessons & playbook (self-learning) ────────────────────────────────────

export type PlaybookRow = { version: number; rules: import("./agent-judge").PlaybookRule[]; lessons_used: number; status: "ACTIVE" | "RETIRED" | "DISABLED"; created_at: string };
export type LessonRow = {
  id: string;
  trade_id: string | null;
  symbol: string;
  setup: string | null;
  realized_r: number;
  category: string;
  decision_quality: "GOOD" | "NEUTRAL" | "POOR";
  what_happened: string;
  lesson: string;
  applies_when: string;
  playbook_version: number | null;
  created_at: string;
};

export async function getActivePlaybook(): Promise<PlaybookRow | null> {
  const { data } = await getSupabase().from("trading_playbook").select("*").eq("status", "ACTIVE").order("version", { ascending: false }).limit(1).maybeSingle();
  return (data as PlaybookRow) ?? null;
}

export async function listPlaybooks(limit = 10): Promise<PlaybookRow[]> {
  const { data } = await getSupabase().from("trading_playbook").select("*").order("version", { ascending: false }).limit(limit);
  return (data ?? []) as PlaybookRow[];
}

export async function listLessons(limit = 50): Promise<LessonRow[]> {
  const { data } = await getSupabase().from("trading_lessons").select("*").order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as LessonRow[]).map((l) => ({ ...l, realized_r: Number(l.realized_r) }));
}

export async function countLessonsSince(iso: string | null): Promise<number> {
  let q = getSupabase().from("trading_lessons").select("id", { count: "exact", head: true });
  if (iso) q = q.gt("created_at", iso);
  const { count } = await q;
  return count ?? 0;
}

export async function insertLesson(row: Omit<LessonRow, "id" | "created_at">) {
  const { data, error } = await getSupabase().from("trading_lessons").upsert(row, { onConflict: "trade_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error(`insert lesson: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

/** New playbook version becomes ACTIVE; the previous active one is retired (kept for audit/rollback). */
export async function activatePlaybook(rules: PlaybookRow["rules"], lessonsUsed: number): Promise<number> {
  const sb = getSupabase();
  const { data: last } = await sb.from("trading_playbook").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((last as { version: number } | null)?.version ?? 0) + 1;
  await sb.from("trading_playbook").update({ status: "RETIRED" }).eq("status", "ACTIVE");
  const { error } = await sb.from("trading_playbook").insert({ version, rules, lessons_used: lessonsUsed, status: "ACTIVE" });
  if (error) throw new Error(`playbook: ${error.message}`);
  return version;
}

export async function setPlaybookStatus(version: number, status: PlaybookRow["status"]) {
  const sb = getSupabase();
  if (status === "ACTIVE") await sb.from("trading_playbook").update({ status: "RETIRED" }).eq("status", "ACTIVE");
  await sb.from("trading_playbook").update({ status }).eq("version", version);
}
