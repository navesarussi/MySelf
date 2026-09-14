import { LEARNING_RULES } from "./config";
import { runBacktestV2 } from "./strategy/backtest-v2";
import { DEFAULT_V2_PARAMS, type StrategyV2Params, type SymbolFrames } from "./strategy/candidates";
import type { AssetClass } from "./types";
import { computeStats, mulberry32, type PerformanceStats } from "./metrics";
import type { CalendarEvent } from "./veto";

/** Learning layer (section 4): bucket stats, binary eligibility gate, agent value, quarterly calibration. */

export type JournalTrade = {
  id: string;
  trigger_id: string | null;
  symbol: string;
  bucket_id: string;
  track: "DETERMINISTIC" | "AGENT";
  execution: "SHADOW" | "PAPER" | "LIVE";
  realized_r: number;
  agent_risk_multiplier: number | null;
  agent_conviction: number | null;
  reached_1r: boolean;
  closed_at: number;
  /** Would the deterministic strategy alone have entered? (false = AI-discretion opportunity) */
  baseline_enter?: boolean;
};

// ── 4b. Eligibility gate — binary only ────────────────────────────────────────

export type Eligibility = "ACTIVE" | "DISABLED_POOR" | "REVIEW_SIM";

export type EligibilityDecision = {
  symbol: string;
  from: Eligibility;
  to: Eligibility;
  reason: string;
  stats: PerformanceStats;
};

export function evaluateEligibility(input: {
  universe: { symbol: string; bucket_id: string | null; eligibility: Eligibility; eligibility_changed_at: number | null }[];
  /** Closed DETERMINISTIC-track trades — the strategy itself, independent of the agent. */
  trades: JournalTrade[];
  now: number;
}): EligibilityDecision[] {
  const det = input.trades.filter((t) => t.track === "DETERMINISTIC");
  const byBucket = new Map<string, JournalTrade[]>();
  for (const t of det) byBucket.set(t.bucket_id, [...(byBucket.get(t.bucket_id) ?? []), t]);
  const out: EligibilityDecision[] = [];
  const dayMs = 86_400_000;

  for (const u of input.universe) {
    const mine = det.filter((t) => t.symbol === u.symbol);
    const stats = computeStats(mine.map((t) => ({ r: t.realized_r, closed_at: t.closed_at, reached_1r: t.reached_1r })));
    const bucketTrades = (u.bucket_id ? byBucket.get(u.bucket_id) ?? [] : []).filter((t) => t.symbol !== u.symbol);
    const bucket = computeStats(bucketTrades.map((t) => ({ r: t.realized_r, closed_at: t.closed_at })));

    if (u.eligibility === "ACTIVE") {
      const poor =
        stats.trades >= LEARNING_RULES.DISABLE_MIN_TRADES &&
        stats.expectancy_r < LEARNING_RULES.DISABLE_MAX_EXPECTANCY_R &&
        (bucket.trades === 0 || stats.expectancy_r < bucket.expectancy_r - LEARNING_RULES.DISABLE_BUCKET_GAP_R);
      if (poor) {
        out.push({
          symbol: u.symbol,
          from: "ACTIVE",
          to: "DISABLED_POOR",
          reason: `${stats.trades} trades, expectancy ${stats.expectancy_r}R vs bucket ${bucket.expectancy_r}R`,
          stats,
        });
      }
    } else if (u.eligibility === "DISABLED_POOR") {
      if (u.eligibility_changed_at !== null && input.now - u.eligibility_changed_at >= LEARNING_RULES.REENABLE_REVIEW_DAYS * dayMs) {
        out.push({ symbol: u.symbol, from: "DISABLED_POOR", to: "REVIEW_SIM", reason: "90-day review — simulation only", stats });
      }
    } else if (u.eligibility === "REVIEW_SIM" && u.eligibility_changed_at !== null) {
      const since = mine.filter((t) => t.closed_at >= u.eligibility_changed_at!);
      const s = computeStats(since.map((t) => ({ r: t.realized_r, closed_at: t.closed_at })));
      if (s.trades >= LEARNING_RULES.DISABLE_MIN_TRADES) {
        out.push({
          symbol: u.symbol,
          from: "REVIEW_SIM",
          to: s.expectancy_r >= 0 ? "ACTIVE" : "DISABLED_POOR",
          reason: `review sample ${s.trades} trades, expectancy ${s.expectancy_r}R`,
          stats: s,
        });
      }
    }
  }
  return out;
}

export function bucketStats(trades: JournalTrade[]) {
  const det = trades.filter((t) => t.track === "DETERMINISTIC");
  const groups = new Map<string, JournalTrade[]>();
  for (const t of det) groups.set(t.bucket_id, [...(groups.get(t.bucket_id) ?? []), t]);
  return [...groups.entries()]
    .map(([bucket_id, list]) => ({
      bucket_id,
      symbols: [...new Set(list.map((t) => t.symbol))],
      stats: computeStats(list.map((t) => ({ r: t.realized_r, closed_at: t.closed_at, reached_1r: t.reached_1r }))),
    }))
    .sort((a, b) => b.stats.trades - a.stats.trades);
}

// ── 4d. Does the agent layer add money? ───────────────────────────────────────

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

export const AGENT_VALUE_MIN_TRIGGERS = 100;
export const AGENT_VALUE_EPSILON_R = 0.05;

/**
 * Paired comparison on the same triggers: deterministic R vs agent R × multiplier
 * (a SKIP contributes 0). `agentCostR` = model cost per trigger expressed in R.
 */
export function agentValueReport(trades: JournalTrade[], agentCostR = 0): AgentValueReport {
  const byTrigger = new Map<string, { det?: JournalTrade; agent?: JournalTrade }>();
  for (const t of trades) {
    if (!t.trigger_id) continue;
    const e = byTrigger.get(t.trigger_id) ?? {};
    if (t.track === "DETERMINISTIC") e.det = t;
    else e.agent = t;
    byTrigger.set(t.trigger_id, e);
  }
  const pairs: { det: number; agent: number; skipped: boolean; conviction: number | null }[] = [];
  for (const { det, agent } of byTrigger.values()) {
    if (!det) continue;
    const mult = det.agent_risk_multiplier ?? 0;
    const skipped = mult === 0;
    // An agent-track trade exists only when the agent entered; its R is scaled by its multiplier.
    const agentR = skipped ? 0 : (agent?.realized_r ?? det.realized_r) * mult;
    // The DETERMINISTIC row always carries the outcome; the baseline only "earns" it if it would have entered.
    const detR = det.baseline_enter === false ? 0 : det.realized_r;
    pairs.push({ det: detR, agent: agentR - agentCostR, skipped, conviction: det.agent_conviction });
  }
  const n = pairs.length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const detE = mean(pairs.map((p) => p.det));
  const agE = mean(pairs.map((p) => p.agent));
  const diffs = pairs.map((p) => p.agent - p.det);
  let ci: [number, number] | null = null;
  if (n >= 20) {
    const rand = mulberry32(1234);
    const boots: number[] = [];
    for (let b = 0; b < 1000; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += diffs[Math.floor(rand() * n)];
      boots.push(s / n);
    }
    boots.sort((a, b) => a - b);
    ci = [round(boots[50]), round(boots[949])];
  }
  const diff = agE - detE;
  const verdict: AgentValueReport["verdict"] =
    n < AGENT_VALUE_MIN_TRIGGERS ? "INSUFFICIENT_DATA" : diff > AGENT_VALUE_EPSILON_R ? "ADDS_VALUE" : diff < -AGENT_VALUE_EPSILON_R ? "DESTROYS_VALUE" : "NEUTRAL";
  const convictions = [1, 2, 3, 4, 5].map((c) => {
    const list = pairs.filter((p) => p.conviction === c);
    return { conviction: c, triggers: list.length, deterministic_expectancy_r: round(mean(list.map((p) => p.det))) };
  });
  return {
    triggers: n,
    deterministic_expectancy_r: round(detE),
    agent_expectancy_r: round(agE),
    diff_r: round(diff),
    diff_ci90: ci,
    agent_skip_rate: n ? round(pairs.filter((p) => p.skipped).length / n) : 0,
    skipped_winners: pairs.filter((p) => p.skipped && p.det > 0).length,
    skipped_losers: pairs.filter((p) => p.skipped && p.det < 0).length,
    verdict,
    by_conviction: convictions,
  };
}

const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

// ── Walk-forward (used by the backtest gate and by quarterly calibration) ────

export type FoldResult = { fold: number; start: number; end: number; stats: PerformanceStats };

export function foldRanges(start: number, end: number, folds: number) {
  const span = (end - start) / folds;
  return Array.from({ length: folds }, (_, i) => ({ start: Math.round(start + i * span), end: Math.round(start + (i + 1) * span) }));
}

export type WalkForwardInput = {
  frames: SymbolFrames[];
  reference: Partial<Record<AssetClass, SymbolFrames>>;
  start: number;
  end: number;
  startingEquity: number;
  calendar: CalendarEvent[];
};

/** Fixed params across consecutive folds: does the edge persist, or collapse in some regime? */
export function walkForwardStability(h: WalkForwardInput, params: StrategyV2Params, folds = 4) {
  const results: FoldResult[] = foldRanges(h.start, h.end, folds).map((r, i) => ({
    fold: i + 1,
    ...r,
    stats: runBacktestV2({ frames: h.frames, reference: h.reference, params, starting_equity: h.startingEquity, start: r.start, end: r.end, calendar: h.calendar }).stats,
  }));
  const oos = results.slice(1);
  const oosMean = oos.reduce((s, f) => s + f.stats.expectancy_r * f.stats.trades, 0) / Math.max(1, oos.reduce((s, f) => s + f.stats.trades, 0));
  const collapsed = results.filter((f) => f.stats.trades >= 5 && f.stats.expectancy_r < -0.25).length;
  return { folds: results, oos_expectancy_r: round(oosMean), collapsed_folds: collapsed, passes: oosMean > 0 && collapsed === 0 };
}

/** Deliberately small grid — more knobs on a few hundred trades is curve fitting, not learning. */
export const CALIBRATION_GRID = {
  min_score: [50, 60, 70],
  trail_mult_atr4h: [3, 4],
};

export function calibrationCandidates(base: StrategyV2Params = DEFAULT_V2_PARAMS): StrategyV2Params[] {
  const out: StrategyV2Params[] = [];
  for (const min_score of CALIBRATION_GRID.min_score)
    for (const trail_mult_atr4h of CALIBRATION_GRID.trail_mult_atr4h)
      out.push({ ...base, min_score, trail_mult_atr4h, version: `v2-score${min_score}-trail${trail_mult_atr4h}` });
  return out;
}

const MIN_TRAIN_TRADES = 20;

/**
 * Anchored walk-forward: for each fold k≥1, choose the best candidate on folds [0..k-1],
 * then measure it out of sample on fold k. The proposal is the candidate chosen on all data,
 * but the evidence shown is the OOS record of the selection procedure itself.
 */
export function runCalibration(h: WalkForwardInput, current: StrategyV2Params, folds = 3) {
  const candidates = calibrationCandidates(current);
  const ranges = foldRanges(h.start, h.end, folds);
  const run = (p: StrategyV2Params, start: number, end: number) =>
    runBacktestV2({ frames: h.frames, reference: h.reference, params: p, starting_equity: h.startingEquity, start, end, calendar: h.calendar }).stats;
  const pickBest = (start: number, end: number) => {
    let best = { params: current, stats: run(current, start, end) };
    for (const c of candidates) {
      const s = run(c, start, end);
      if (s.trades >= MIN_TRAIN_TRADES && s.expectancy_r > best.stats.expectancy_r) best = { params: c, stats: s };
    }
    return best;
  };
  const steps = ranges.slice(1).map((test, i) => {
    const chosen = pickBest(ranges[0].start, ranges[i].end);
    return {
      test_fold: i + 2,
      chosen_version: chosen.params.version,
      in_sample: chosen.stats,
      out_of_sample: run(chosen.params, test.start, test.end),
      current_out_of_sample: run(current, test.start, test.end),
    };
  });
  const final = pickBest(h.start, h.end);
  const sumR = (xs: PerformanceStats[]) => round(xs.reduce((s, x) => s + x.total_r, 0));
  const oosR = sumR(steps.map((s) => s.out_of_sample));
  const currentOosR = sumR(steps.map((s) => s.current_out_of_sample));
  return {
    proposed: final.params,
    proposed_in_sample: final.stats,
    steps,
    oos_total_r: oosR,
    current_oos_total_r: currentOosR,
    recommend: final.params.version !== current.version && oosR > currentOosR && oosR > 0,
  };
}
