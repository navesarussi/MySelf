import { getSupabase } from "@/lib/supabase";
import { COMMITTEE_MODEL_STAGE_KEYS, COMMITTEE_PROMPT_VERSIONS, getCommitteeConfig } from "./config";
import { buildDualTrackReport, type DualTrackMetricsRow } from "./dual-track";
import type { CommitteeMetricsRow } from "./metrics";
import { buildReflectionNote, type ReflectionNote } from "./reflection";
import type { CommitteeRunResult } from "./runner";

function normalizePromptVersions(v: Record<string, string>): Record<string, string> {
  return { ...COMMITTEE_PROMPT_VERSIONS, ...v };
}

function normalizeModelVersions(v: Record<string, string>): Record<string, string> {
  const out = { ...v };
  for (const stage of COMMITTEE_MODEL_STAGE_KEYS) {
    if (!out[stage]) out[stage] = "not_run";
  }
  return out;
}

export type CommitteeRunRow = {
  id: string;
  ticket_id: string;
  symbol: string;
  strategy: string;
  bar_time: string;
  trigger_id: string | null;
  shadow: boolean;
  status: CommitteeRunResult["status"];
  outcome: CommitteeRunResult["outcome"];
  ticket: unknown;
  technical_report: unknown | null;
  fundamental_report: unknown | null;
  debate: unknown | null;
  soft_risk: unknown | null;
  certificate: unknown | null;
  execution_intent: unknown | null;
  would_have_executed: boolean;
  blocks: string[];
  errors: string[];
  injection_flags: string[];
  latency_ms: number;
  model_versions: Record<string, string>;
  prompt_versions: Record<string, string>;
  created_at: string;
};

export async function insertCommitteeRunSafe(result: CommitteeRunResult): Promise<boolean> {
  try {
    await insertCommitteeRun(result);
    return true;
  } catch {
    return false;
  }
}

export async function insertCommitteeRun(result: CommitteeRunResult): Promise<string> {
  const row = {
    id: result.runId,
    ticket_id: result.ticket.id,
    symbol: result.ticket.symbol,
    strategy: result.ticket.strategy,
    bar_time: result.ticket.bar_time,
    trigger_id: result.triggerId ?? null,
    shadow: result.shadow,
    status: result.status,
    outcome: result.outcome,
    ticket: result.ticket,
    technical_report: result.technical,
    fundamental_report: result.fundamental,
    debate: result.debate,
    soft_risk: result.softRisk,
    certificate: result.certificate,
    execution_intent: result.executionIntent,
    would_have_executed: result.wouldHaveExecuted,
    blocks: result.blocks,
    errors: result.errors,
    injection_flags: result.injectionFlags,
    latency_ms: result.latencyMs,
    model_versions: normalizeModelVersions(result.modelVersions),
    prompt_versions: normalizePromptVersions(result.promptVersions),
  };
  const { data, error } = await getSupabase()
    .from("trading_committee_runs")
    .upsert(row, { onConflict: "ticket_id", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`trading_committee_runs: ${error.message}`);
  return String((data as { id: string } | null)?.id ?? result.runId);
}

export async function getCommitteeRunByTicketId(ticketId: string): Promise<CommitteeRunRow | null> {
  const { data, error } = await getSupabase().from("trading_committee_runs").select("*").eq("ticket_id", ticketId).maybeSingle();
  if (error) throw new Error(`trading_committee_runs read: ${error.message}`);
  return (data as CommitteeRunRow | null) ?? null;
}

type TriggerBaselineRow = {
  id: string;
  baseline_enter: boolean | null;
  agent_decision: string | null;
};

/** Map persisted committee run + optional trigger baseline flags to metrics row shape. */
export function committeeRunRowToMetricsRow(row: CommitteeRunRow, trigger?: TriggerBaselineRow | null): DualTrackMetricsRow {
  const soft = row.soft_risk as CommitteeMetricsRow["soft_risk"];
  const cert = row.certificate as CommitteeMetricsRow["certificate"];
  const baselineEnter = trigger?.baseline_enter ?? null;
  const agentEnter = trigger?.agent_decision === "ENTER" ? true : trigger?.agent_decision === "SKIP" ? false : null;
  return {
    ticket_id: row.ticket_id,
    symbol: row.symbol,
    strategy: row.strategy,
    bar_time: row.bar_time,
    would_have_executed: row.would_have_executed,
    outcome: row.outcome,
    status: row.status,
    blocks: row.blocks ?? [],
    latency_ms: row.latency_ms,
    soft_risk: soft,
    certificate: cert,
    baseline_would_enter: baselineEnter,
    baseline_agent_enter: agentEnter,
  };
}

export async function listCommitteeRunsSince(sinceIso?: string, limit = 500): Promise<CommitteeRunRow[]> {
  let q = getSupabase().from("trading_committee_runs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw new Error(`trading_committee_runs list: ${error.message}`);
  return (data as CommitteeRunRow[]) ?? [];
}

async function fetchTriggerBaselines(triggerIds: string[]): Promise<Map<string, TriggerBaselineRow>> {
  const map = new Map<string, TriggerBaselineRow>();
  if (!triggerIds.length) return map;
  const { data, error } = await getSupabase()
    .from("trading_triggers")
    .select("id, baseline_enter, agent_decision")
    .in("id", triggerIds);
  if (error) throw new Error(`trading_triggers baseline read: ${error.message}`);
  for (const row of (data as TriggerBaselineRow[]) ?? []) map.set(row.id, row);
  return map;
}

/** Cron-safe dual-track summary from DB rows joined to trigger baselines when linked. */
export async function getCommitteeDualTrackSummary(opts?: { sinceIso?: string; limit?: number }) {
  const rows = await listCommitteeRunsSince(opts?.sinceIso, opts?.limit ?? 500);
  const triggerIds = [...new Set(rows.map((r) => r.trigger_id).filter(Boolean))] as string[];
  const baselines = await fetchTriggerBaselines(triggerIds);
  const metricsRows = rows.map((r) => committeeRunRowToMetricsRow(r, r.trigger_id ? baselines.get(r.trigger_id) : null));
  return buildDualTrackReport(metricsRows);
}

export type CommitteeReflectionRow = {
  id: string;
  run_id: string;
  ticket_id: string;
  symbol: string;
  strategy: string;
  note: ReflectionNote;
  created_at: string;
};

export async function insertReflectionNote(note: ReflectionNote): Promise<string> {
  const row = {
    id: note.id,
    run_id: note.run_id,
    ticket_id: note.ticket_id,
    symbol: note.symbol,
    strategy: note.strategy,
    note,
  };
  const { data, error } = await getSupabase()
    .from("trading_committee_reflections")
    .upsert(row, { onConflict: "run_id", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`trading_committee_reflections: ${error.message}`);
  return String((data as { id: string } | null)?.id ?? note.id);
}

export async function insertReflectionNoteSafe(note: ReflectionNote): Promise<boolean> {
  try {
    await insertReflectionNote(note);
    return true;
  } catch {
    return false;
  }
}

/** When COMMITTEE_REFLECTION=true, append a deterministic note after a shadow run is persisted. */
export async function maybeRecordReflection(result: CommitteeRunResult): Promise<boolean> {
  if (!getCommitteeConfig().reflection) return false;
  const note = buildReflectionNote(result);
  return insertReflectionNoteSafe(note);
}

export type GateEvalRow = {
  id: string;
  eval_day: string;
  verdict: "PASS" | "FAIL";
  reasons: string[];
  metrics: unknown;
  criteria: unknown;
  window_since: string | null;
  window_limit: number;
  generated_at: string;
  created_at: string;
};

export type GateEvalPersistInput = {
  id: string;
  eval_day: string;
  verdict: "PASS" | "FAIL";
  reasons: string[];
  metrics: unknown;
  criteria: unknown;
  window_since: string | null;
  window_limit: number;
  generated_at: string;
};

export async function insertGateEval(row: GateEvalPersistInput): Promise<string> {
  const payload = {
    id: row.id,
    eval_day: row.eval_day,
    verdict: row.verdict,
    reasons: row.reasons,
    metrics: row.metrics,
    criteria: row.criteria,
    window_since: row.window_since,
    window_limit: row.window_limit,
    generated_at: row.generated_at,
  };
  const { data, error } = await getSupabase()
    .from("trading_committee_gate_evals")
    .upsert(payload, { onConflict: "eval_day", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`trading_committee_gate_evals: ${error.message}`);
  return String((data as { id: string } | null)?.id ?? row.id);
}

export async function insertGateEvalSafe(row: GateEvalPersistInput): Promise<boolean> {
  try {
    await insertGateEval(row);
    return true;
  } catch {
    return false;
  }
}

export async function listGateEvalsSinceDay(sinceDay: string, limit = 120): Promise<GateEvalRow[]> {
  const { data, error } = await getSupabase()
    .from("trading_committee_gate_evals")
    .select("*")
    .gte("eval_day", sinceDay)
    .order("eval_day", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`trading_committee_gate_evals list: ${error.message}`);
  return (data as GateEvalRow[]) ?? [];
}

export async function listGateEvalsSinceDaySafe(sinceDay: string, limit = 120): Promise<GateEvalRow[]> {
  try {
    return await listGateEvalsSinceDay(sinceDay, limit);
  } catch {
    return [];
  }
}
