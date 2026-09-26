import { getSupabase } from "@/lib/supabase";
import type { ExperienceCard, AgentVerdict } from "./agent-judge";
import { computeStats } from "./metrics";
import { newPendingPosition } from "./position";
import { simColumns, type TradeRow } from "./store";
import { DAILY_TREND_STRATEGY_VERSION, STRATEGY_VERSION } from "./strategy-versions";
import { LIVE_DAILY_TREND_PARAMS, type DailyCandidate } from "./strategy/daily-trend";
import type { Candidate, StrategyV2Params } from "./strategy/candidates";
import { iso } from "./tick-context";
import type { Bar } from "./types";

/**
 * Writing a trade row, and the track record the agent is shown before it
 * decides.
 *
 * Both scans do the same two things — build an ExperienceCard from closed
 * deterministic trades, then insert a PENDING trade with its simulated position
 * — so they live together rather than once per scan file.
 */

export function experienceCard(symbol: string, c: Candidate, closed: TradeRow[]): ExperienceCard {
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

export async function insertTrade(t: {
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
      // The agent comments; it does not decide (see scanDailyTrend) — the row records what was executed.
      agent_decision: "ENTER",
      agent_conviction: t.verdict?.conviction ?? null,
      agent_risk_multiplier: 1,
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

export function dailyTrendExperienceCard(symbol: string, closed: TradeRow[]): ExperienceCard {
  const det = closed.filter((t) => t.track === "DETERMINISTIC" && t.strategy_version === DAILY_TREND_STRATEGY_VERSION);
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

export async function insertDailyTrendTrade(t: {
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
      // The agent comments; it does not decide (see scanDailyTrend) — the row records what was executed.
      agent_decision: "ENTER",
      agent_conviction: t.verdict?.conviction ?? null,
      agent_risk_multiplier: 1,
      agent_reasoning: t.verdict?.primary_reasoning ?? null,
      agent_model_version: t.verdict?.model_version ?? "agent-disabled",
      prompt_version: t.verdict?.prompt_version ?? "none",
      param_version: LIVE_DAILY_TREND_PARAMS.version,
      strategy_version: DAILY_TREND_STRATEGY_VERSION,
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
