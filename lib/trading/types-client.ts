/**
 * Client-safe trading API types shared by the Expo app and server.
 * Keep this file free of Supabase, AI SDK, or other server-only imports.
 */
import type { EXECUTION_RULES, RISK_ENVELOPE } from "./config";
import type { GateCheck } from "./gates";
import type { GroupStat, PerformanceStats, RatingValue } from "./metrics";
import type { QualityReport, TradeQuality } from "./trade-quality";
import type { PositionEvent, SimPosition } from "./position";
import type { StrategyV2Params } from "./strategy/candidates";
import type { AssetClass, Bar, ExitPlan, TradingMode, TradingPhase } from "./types";

export type { GateCheck } from "./gates";
export type { GroupStat, PerformanceStats } from "./metrics";
export type { QualityReport, TradeQuality } from "./trade-quality";
export type { Bar } from "./types";

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
  intraday_enabled: boolean;
  last_intraday_tick_at: string | null;
  last_intraday_summary: Record<string, unknown> | null;
  last_intraday_universe_date: string | null;
  updated_at: string;
};

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
  agent_rating: number | null;
  agent_rating_explanation: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaybookRule = {
  rule: string;
  category: string;
  applies_when: string;
  evidence: number;
};

export type PlaybookRow = {
  version: number;
  rules: PlaybookRule[];
  lessons_used: number;
  status: "ACTIVE" | "RETIRED" | "DISABLED";
  created_at: string;
};

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

export type TradingEvent = {
  id: string;
  kind: string;
  severity: string;
  symbol: string | null;
  message: string;
  created_at: string;
};

export type PhaseGateView = {
  phase: TradingPhase;
  next: TradingPhase | null;
  checks: GateCheck[];
  passes: boolean;
  days_in_phase: number;
};

export type BrokerStatus = {
  configured: boolean;
  venue: "SIM" | "ALPACA_PAPER";
  connected: boolean;
  equity: number | null;
  cash: number | null;
  error: string | null;
};

/** Live account equity — shared by Home tile, Trading screen, and widgets. */
export type TradingEquitySnapshot = {
  equity: number;
  starting_equity: number;
  peak_equity: number;
  kill_switch_active: boolean;
  phase: string;
  updated_at: string;
};

/** Fast dashboard core — positions, KPIs, gate, equity curve (no feed or broker). */
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

export type TradeListItem = Omit<TradeRow, "sim_state" | "chart_bars" | "events" | "trigger_snapshot">;

export type AgentValueReport = {
  triggers: number;
  deterministic_expectancy_r: number;
  agent_expectancy_r: number;
  diff_r: number;
  diff_ci90: [number, number] | null;
  agent_skip_rate: number;
  skipped_winners: number;
  skipped_losers: number;
  verdict: "INSUFFICIENT_DATA" | "ADDS_VALUE" | "NEUTRAL" | "DESTROYS_VALUE";
  by_conviction: { conviction: number; triggers: number; deterministic_expectancy_r: number }[];
};

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
  buckets: { bucket_id: string; trades: number; expectancy_r: number; win_rate: number }[];
  quality: QualityReport;
};

export type BacktestGateInput = {
  stats: PerformanceStats;
  return_pct: number;
  benchmark_return_pct: number | null;
  sharpe: number | null;
  benchmark_sharpe: number | null;
  max_dd_pct: number;
  benchmark_max_dd_pct: number | null;
  walk_forward_passes: boolean;
  oos_expectancy_r: number;
  mc_dd_pct_p95: number;
  mc_prob_kill: number;
  created_at: number;
} | null;

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
  monte_carlo: {
    runs: number;
    max_dd_r_p50: number;
    max_dd_r_p95: number;
    final_r_p5: number;
    final_r_p50: number;
    max_dd_pct_p95: number;
    prob_kill_switch: number;
  };
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

export type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending_command: (ControlCommand & { summary: string }) | null;
  command_status: "PENDING" | "CONFIRMED" | "REJECTED" | "EXPIRED" | "FAILED" | null;
  created_at: string;
};

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
  | {
      action: "add_calendar_event";
      kind: "CPI" | "FOMC" | "EARNINGS" | "TOKEN_UNLOCK" | "OTHER_MACRO";
      date: string;
      symbol?: string | null;
      note?: string | null;
    }
  | { action: "rearm_kill_switch"; phrase: string }
  | { action: "set_phase"; phase: TradingPhase }
  | { action: "mark_review"; key: "reasoning_reviewed" | "resilience_reviewed" };

export type TradePlanProposal = {
  rating: number | null;
  explanation: string | null;
  order_type: "MARKET" | "LIMIT";
  entry: number;
  stop: number;
  target: number;
  rr: number;
  notes: string[];
  source: "AGENT" | "DETERMINISTIC";
  model_version: string;
  prompt_version: string;
  error: string | null;
};

export type TradingProposalOption = {
  symbol: string;
  asset_class: string;
  tier: "CONFIRMED" | "ARMED" | "RECENT" | "WATCH";
  setup: string;
  score: number;
  price: number;
  atr15: number;
  entry: number;
  stop: number;
  target: number;
  rr: number;
  structural_stop: number;
  range: unknown;
  features: unknown;
  setup_bar_time: number | null;
  plan: TradePlanProposal;
  broker_tradable: boolean;
  preview: { size: number; notional: number; risk_amount: number; risk_pct: number } | null;
  envelope_blocks: string[];
};

export type TradingProposal = {
  id: string | null;
  created_at?: string;
  expires_at?: string;
  scanned: number;
  stocks_open: boolean;
  equity?: number;
  options: TradingProposalOption[];
  errors: string[];
};

export type TradingTradeDetail = {
  trade: TradeRow;
  trigger: TriggerRow | null;
  sibling: TradeListItem | null;
  lesson: LessonRow | null;
  quality: TradeQuality;
};

export type TradingBacktestSummary = {
  id: string;
  mode: string;
  years: number;
  symbols: string[];
  param_version: string;
  range_start: string | null;
  range_end: string | null;
  gate: (BacktestGateInput & { checks: GateCheck[] }) | null;
  duration_ms: number | null;
  created_at: string;
};

export type TradingBacktestDetail = TradingBacktestSummary & {
  results: V2Result[];
  walk_forward: {
    folds: { fold: number; start: number; end: number; stats: PerformanceStats }[];
    oos_expectancy_r: number;
    passes: boolean;
  } | null;
  skipped: { symbol: string; reason: string }[] | null;
};

export type TradingLearningView = {
  playbook: PlaybookRow | null;
  history: PlaybookRow[];
  lessons: LessonRow[];
};

export type TradingParamSet = {
  id: string;
  version: string;
  params: Record<string, number | string>;
  status: "PROPOSED" | "ACTIVE" | "REJECTED" | "RETIRED";
  evidence: {
    oos_total_r: number;
    current_oos_total_r: number;
    recommend: boolean;
    steps: { test_fold: number; chosen_version: string; out_of_sample: PerformanceStats }[];
  } | null;
  locked_until: string | null;
  created_at: string;
};
