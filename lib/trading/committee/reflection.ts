import { createHash } from "crypto";
import type { CommitteeRunResult } from "./runner";
import type { DebateWinner } from "./types";

/** Which layer ultimately blocked execution (deterministic, no LLM). */
export type ReflectionBlockLayer = "NONE" | "SOFT" | "HARD" | "DEBATE" | "ERROR";

export type ReflectionNote = {
  id: string;
  run_id: string;
  ticket_id: string;
  symbol: string;
  strategy: string;
  bar_time: string;
  outcome: CommitteeRunResult["outcome"];
  would_have_executed: boolean;
  block_layer: ReflectionBlockLayer;
  block_codes: string[];
  soft_vs_hard: "soft" | "hard" | "none" | "error";
  soft_summary: {
    allow: boolean;
    risk_multiplier: number;
    stop_policy: string;
    reason_count: number;
    red_flag_count: number;
  } | null;
  debate_tilt: DebateWinner | "NONE";
  debate_recommended_action: "ENTER" | "SKIP" | null;
  debate_conviction: number | null;
  tags: string[];
  built_at: string;
};

function reflectionId(runId: string): string {
  return createHash("sha256").update(`reflection|${runId}`).digest("hex").slice(0, 16);
}

function isSoftBlock(run: CommitteeRunResult): boolean {
  const soft = run.softRisk;
  if (!soft) return false;
  return !soft.allow || soft.risk_multiplier === 0;
}

function isHardBlock(run: CommitteeRunResult): boolean {
  if (run.outcome === "BLOCKED") return true;
  const cert = run.certificate;
  if (!cert) return run.blocks.length > 0;
  return cert.ok === false || (cert.blocks?.length ?? 0) > 0;
}

function resolveBlockLayer(run: CommitteeRunResult): ReflectionBlockLayer {
  if (run.outcome === "ERROR" || run.status === "FAILED" || run.status === "TIMEOUT") return "ERROR";
  if (run.wouldHaveExecuted) return "NONE";
  if (isSoftBlock(run)) return "SOFT";
  if (run.debate?.recommended_action === "SKIP") return "DEBATE";
  if (isHardBlock(run)) return "HARD";
  return "NONE";
}

function buildTags(run: CommitteeRunResult, layer: ReflectionBlockLayer): string[] {
  const tags: string[] = [`layer:${layer.toLowerCase()}`, `outcome:${run.outcome.toLowerCase()}`];
  if (run.debate?.winner) tags.push(`debate:${run.debate.winner.toLowerCase()}`);
  if (run.softRisk && !run.softRisk.allow) tags.push("soft:deny");
  if (run.softRisk?.risk_multiplier != null && run.softRisk.risk_multiplier < 1) {
    tags.push(`soft:shrink_${run.softRisk.risk_multiplier}`);
  }
  if (run.softRisk?.stop_policy === "TIGHTEN") tags.push("soft:tighten_stop");
  for (const code of run.blocks.slice(0, 4)) tags.push(`block:${code.toLowerCase()}`);
  if (run.injectionFlags.length) tags.push("injection_flagged");
  return [...new Set(tags)];
}

/**
 * Deterministic reflection note from a persisted committee run — v1 has no LLM.
 * Intended for offline playbook / CVRF-lite hooks after shadow audits land.
 */
export function buildReflectionNote(run: CommitteeRunResult, builtAtMs = Date.now()): ReflectionNote {
  const layer = resolveBlockLayer(run);
  const soft = run.softRisk;
  const debate = run.debate;

  let softVsHard: ReflectionNote["soft_vs_hard"] = "none";
  if (layer === "ERROR") softVsHard = "error";
  else if (layer === "HARD") softVsHard = "hard";
  else if (layer === "SOFT") softVsHard = "soft";

  return {
    id: reflectionId(run.runId),
    run_id: run.runId,
    ticket_id: run.ticket.id,
    symbol: run.ticket.symbol,
    strategy: run.ticket.strategy,
    bar_time: run.ticket.bar_time,
    outcome: run.outcome,
    would_have_executed: run.wouldHaveExecuted,
    block_layer: layer,
    block_codes: [...run.blocks],
    soft_vs_hard: softVsHard,
    soft_summary: soft
      ? {
          allow: soft.allow,
          risk_multiplier: soft.risk_multiplier,
          stop_policy: soft.stop_policy,
          reason_count: soft.reasons?.length ?? 0,
          red_flag_count: soft.red_flags?.length ?? 0,
        }
      : null,
    debate_tilt: debate?.winner ?? "NONE",
    debate_recommended_action: debate?.recommended_action ?? null,
    debate_conviction: debate?.conviction ?? null,
    tags: buildTags(run, layer),
    built_at: new Date(builtAtMs).toISOString(),
  };
}
