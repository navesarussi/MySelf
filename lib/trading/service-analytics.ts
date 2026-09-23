import { computeStats, equityCurveR, groupStats, rDistribution, ratingValue, type GroupStat, type PerformanceStats, type RatingValue } from "./metrics";
import { getClosedTrades, toJournalTrade } from "./store";
import { agentValueReport, bucketStats, type AgentValueReport } from "./learning";
import { round } from "./round";
import { qualityReport, type QualityReport } from "./trade-quality";

/** Performance analytics over closed trades. */

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
  /** Cost drag, capture efficiency, hold-time split, and the heat winners took. */
  quality: QualityReport;
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
    quality: qualityReport(list),
  };
}
