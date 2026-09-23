import { getSupabase } from "@/lib/supabase";
import { getCommitteeConfig } from "./config";
import { buildReflectionNote, type ReflectionNote } from "./reflection";
import type { CommitteeRunResult } from "./runner";

/** Append-only reflection notes, written after a shadow run when enabled. */

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
