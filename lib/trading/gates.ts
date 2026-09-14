import { PHASE_GATES } from "./config";
import type { AgentValueReport } from "./learning";
import type { PerformanceStats } from "./metrics";
import type { TradingPhase } from "./types";

/** Section 8 — Go/No-Go gates. No phase can be skipped; LIVE additionally needs a broker adapter. */

export type GateCheck = { id: string; ok: boolean; detail: string; manual?: boolean };
export type GateReport = { from: TradingPhase; to: TradingPhase | null; checks: GateCheck[]; passes: boolean };

export const PHASE_ORDER: TradingPhase[] = ["BACKTEST", "SHADOW", "PAPER", "LIVE"];

export function nextPhase(p: TradingPhase): TradingPhase | null {
  const i = PHASE_ORDER.indexOf(p);
  return i >= 0 && i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : null;
}

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

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function backtestGate(bt: BacktestGateInput): GateCheck[] {
  if (!bt) return [{ id: "backtest_exists", ok: false, detail: "No backtest has been run yet" }];
  return [
    { id: "min_trades", ok: bt.stats.trades >= PHASE_GATES.BACKTEST_MIN_TRADES, detail: `${bt.stats.trades} / ${PHASE_GATES.BACKTEST_MIN_TRADES} trades` },
    { id: "positive_expectancy", ok: bt.stats.expectancy_r > 0, detail: `expectancy ${bt.stats.expectancy_r}R` },
    { id: "walk_forward", ok: bt.walk_forward_passes, detail: `OOS expectancy ${bt.oos_expectancy_r}R` },
    { id: "monte_carlo_dd", ok: bt.mc_dd_pct_p95 <= 0.2 && bt.mc_prob_kill <= 0.1, detail: `p95 DD ${pct(bt.mc_dd_pct_p95)}, kill-switch probability ${pct(bt.mc_prob_kill)}` },
    {
      // Risk-adjusted: a strategy risking ~1% per trade cannot out-return a 100%-invested bull market,
      // but it must earn more per unit of risk (Sharpe) with a smaller drawdown.
      id: "beats_buy_and_hold_risk_adjusted",
      ok: bt.sharpe !== null && bt.benchmark_sharpe !== null && bt.benchmark_max_dd_pct !== null && bt.sharpe > bt.benchmark_sharpe && bt.max_dd_pct < bt.benchmark_max_dd_pct,
      detail: `Sharpe ${bt.sharpe ?? "n/a"} vs ${bt.benchmark_sharpe ?? "n/a"} · max DD ${pct(bt.max_dd_pct)} vs ${bt.benchmark_max_dd_pct === null ? "n/a" : pct(bt.benchmark_max_dd_pct)} · return ${pct(bt.return_pct)} vs ${bt.benchmark_return_pct === null ? "n/a" : pct(bt.benchmark_return_pct)}`,
    },
  ];
}

export function shadowGate(input: { agent: AgentValueReport; days_in_phase: number; reasoning_reviewed: boolean }): GateCheck[] {
  return [
    { id: "min_triggers", ok: input.agent.triggers >= PHASE_GATES.SHADOW_MIN_TRIGGERS, detail: `${input.agent.triggers} / ${PHASE_GATES.SHADOW_MIN_TRIGGERS} closed triggers` },
    { id: "min_days", ok: input.days_in_phase >= PHASE_GATES.SHADOW_MIN_DAYS, detail: `${input.days_in_phase} / ${PHASE_GATES.SHADOW_MIN_DAYS} days` },
    { id: "agent_not_negative", ok: input.agent.verdict === "ADDS_VALUE" || input.agent.verdict === "NEUTRAL", detail: `agent − deterministic = ${input.agent.diff_r}R (${input.agent.verdict})` },
    { id: "reasoning_reviewed", ok: input.reasoning_reviewed, detail: "You read the agent's reasoning and it makes sense", manual: true },
  ];
}

export function paperGate(input: {
  days_in_phase: number;
  paper_stats: PerformanceStats;
  backtest_expectancy_r: number | null;
  critical_events_14d: number;
  survived_outage_reviewed: boolean;
}): GateCheck[] {
  const dev = input.backtest_expectancy_r === null ? null : Math.abs(input.paper_stats.expectancy_r - input.backtest_expectancy_r);
  return [
    { id: "min_days", ok: input.days_in_phase >= PHASE_GATES.PAPER_MIN_DAYS, detail: `${input.days_in_phase} / ${PHASE_GATES.PAPER_MIN_DAYS} days` },
    {
      id: "matches_backtest",
      ok: dev !== null && dev <= PHASE_GATES.PAPER_MAX_EXPECTANCY_DEVIATION_R && input.paper_stats.trades >= 20,
      detail: `paper ${input.paper_stats.expectancy_r}R over ${input.paper_stats.trades} trades vs backtest ${input.backtest_expectancy_r ?? "n/a"}R`,
    },
    { id: "no_critical_bugs", ok: input.critical_events_14d === 0, detail: `${input.critical_events_14d} critical events in 14 days` },
    { id: "resilience_reviewed", ok: input.survived_outage_reviewed, detail: "Pipeline survived a disconnect, crash and a news event", manual: true },
    { id: "broker_adapter", ok: false, detail: "Real-money broker adapter is intentionally not connected yet (includes Israeli tax check)" },
  ];
}
