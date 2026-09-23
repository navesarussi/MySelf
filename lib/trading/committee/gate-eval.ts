import type { DualTrackSummary } from "./dual-track";
import {
  DEFAULT_PROMOTION_CRITERIA,
  evaluatePromotionGates,
  type CommitteePromotionCriteria,
  type PromotionGateEvaluation,
  type PromotionGateVerdict,
} from "./promotion-gates";
import {
  getCommitteeDualTrackSummary,
  insertGateEvalSafe,
  listGateEvalsSinceDaySafe,
  type GateEvalRow,
} from "./store";

export const DEFAULT_GATE_EVAL_DAYS = 30;
export const DEFAULT_GATE_EVAL_LIMIT = 500;

export type GateEvalPersistRow = {
  id: string;
  eval_day: string;
  verdict: PromotionGateVerdict;
  reasons: string[];
  metrics: PromotionGateEvaluation["metrics"];
  criteria: CommitteePromotionCriteria;
  window_since: string | null;
  window_limit: number;
  generated_at: string;
};

export type NightlyGateEvalResult = {
  evaluation: PromotionGateEvaluation;
  record: GateEvalPersistRow;
  consecutive_pass_days: number;
  persisted: boolean;
};

/** UTC calendar day `YYYY-MM-DD` for eval_day grouping. */
export function utcEvalDay(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

export function gateEvalIdForDay(evalDay: string): string {
  return `gate-eval-${evalDay}`;
}

/** Shape persisted to `trading_committee_gate_evals` — pure, no I/O. */
export function buildGateEvalPersistRow(
  evaluation: PromotionGateEvaluation,
  ctx: {
    evalDay: string;
    windowSince: string | null;
    windowLimit: number;
    generatedAt: string;
  },
): GateEvalPersistRow {
  return {
    id: gateEvalIdForDay(ctx.evalDay),
    eval_day: ctx.evalDay,
    verdict: evaluation.verdict,
    reasons: evaluation.reasons,
    metrics: evaluation.metrics,
    criteria: evaluation.criteria,
    window_since: ctx.windowSince,
    window_limit: ctx.windowLimit,
    generated_at: ctx.generatedAt,
  };
}

function previousUtcDay(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Count consecutive calendar days ending at `anchorDay` (default today UTC)
 * where the stored verdict is PASS. Gaps or missing days break the streak.
 */
export function countConsecutivePassDays(
  rows: Array<Pick<GateEvalRow, "eval_day" | "verdict">>,
  anchorDay?: string,
): number {
  const byDay = new Map<string, PromotionGateVerdict>();
  for (const row of rows) {
    const day = typeof row.eval_day === "string" ? row.eval_day.slice(0, 10) : String(row.eval_day);
    byDay.set(day, row.verdict);
  }

  let count = 0;
  let day = anchorDay ?? utcEvalDay();
  while (byDay.get(day) === "PASS") {
    count += 1;
    day = previousUtcDay(day);
  }
  return count;
}

/** Pure wrapper: dual-track summary → promotion gate evaluation (no env reads). */
export function evaluatePromotionGatesFromSummary(
  summary: DualTrackSummary,
  criteria: CommitteePromotionCriteria = DEFAULT_PROMOTION_CRITERIA,
): PromotionGateEvaluation {
  return evaluatePromotionGates(summary, criteria);
}

export type RunNightlyPromotionGateEvalOpts = {
  days?: number;
  limit?: number;
  criteria?: CommitteePromotionCriteria;
  evalDay?: string;
  persist?: boolean;
};

/**
 * Nightly proof-gate job: load dual-track summary, evaluate, optionally persist.
 * Never reads or mutates COMMITTEE_* env flags.
 */
export async function runNightlyPromotionGateEval(
  opts: RunNightlyPromotionGateEvalOpts = {},
): Promise<NightlyGateEvalResult> {
  const days = opts.days ?? DEFAULT_GATE_EVAL_DAYS;
  const limit = opts.limit ?? DEFAULT_GATE_EVAL_LIMIT;
  const evalDay = opts.evalDay ?? utcEvalDay();
  const sinceIso = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;

  const report = await getCommitteeDualTrackSummary({ sinceIso, limit });
  const evaluation = evaluatePromotionGatesFromSummary(report.summary, opts.criteria);
  const record = buildGateEvalPersistRow(evaluation, {
    evalDay,
    windowSince: sinceIso ?? null,
    windowLimit: limit,
    generatedAt: report.generated_at,
  });

  const history = await listGateEvalsSinceDaySafe(previousUtcDay(evalDay), 400);
  const mergedHistory = [...history.filter((r) => r.eval_day.slice(0, 10) !== evalDay), record];
  const consecutive_pass_days = countConsecutivePassDays(mergedHistory, evalDay);

  const persist = opts.persist !== false;
  const persisted = persist ? await insertGateEvalSafe(record) : false;

  return { evaluation, record, consecutive_pass_days, persisted };
}
