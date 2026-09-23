import { getSupabase } from "@/lib/supabase";
import type { CommitteeRunResult } from "./runner";

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
    model_versions: result.modelVersions,
    prompt_versions: result.promptVersions,
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
