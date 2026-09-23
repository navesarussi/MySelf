import { getSupabase } from "@/lib/supabase";

/** One promotion-gate verdict per UTC day, written by the nightly evaluation. */

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
