import { getSupabase } from "@/lib/supabase";
import type { AgentChannel } from "@/lib/agent/types";
import { logAgentMessage } from "@/lib/agent/log";
import { launchCursorCodingAgent, isCursorCodingConfigured } from "@/lib/agent/coding/cursor-api";
import { parseCodingTaskPrefix } from "@/lib/agent/coding/prefix";
import {
  evaluateCodingQuota,
  formatQuotaBlockedHebrew,
} from "@/lib/agent/coding/quota";
import type {
  CodingAgentJob,
  CodingBridgeResult,
  CodingJobStatus,
} from "@/lib/agent/coding/types";

function rowToJob(row: Record<string, unknown>): CodingAgentJob {
  return {
    id: String(row.id),
    channel: row.channel as AgentChannel,
    task_text: String(row.task_text),
    status: row.status as CodingJobStatus,
    cursor_agent_id: typeof row.cursor_agent_id === "string" ? row.cursor_agent_id : null,
    cursor_run_id: typeof row.cursor_run_id === "string" ? row.cursor_run_id : null,
    agent_url: typeof row.agent_url === "string" ? row.agent_url : null,
    pr_url: typeof row.pr_url === "string" ? row.pr_url : null,
    blocked_reason: typeof row.blocked_reason === "string" ? row.blocked_reason : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function listRecentCodingJobs(): Promise<CodingAgentJob[]> {
  const { data, error } = await getSupabase()
    .from("coding_agent_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("coding_jobs_fetch_failed");
  return (data ?? []).map((row) => rowToJob(row as Record<string, unknown>));
}

async function insertCodingJob(input: {
  channel: AgentChannel;
  task_text: string;
  status: CodingJobStatus;
  cursor_agent_id?: string | null;
  cursor_run_id?: string | null;
  agent_url?: string | null;
  blocked_reason?: string | null;
}): Promise<CodingAgentJob> {
  const { data, error } = await getSupabase()
    .from("coding_agent_jobs")
    .insert({
      channel: input.channel,
      task_text: input.task_text,
      status: input.status,
      cursor_agent_id: input.cursor_agent_id ?? null,
      cursor_run_id: input.cursor_run_id ?? null,
      agent_url: input.agent_url ?? null,
      blocked_reason: input.blocked_reason ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("coding_job_insert_failed");
  return rowToJob(data as Record<string, unknown>);
}

function formatLaunchAckHebrew(input: {
  jobId: string;
  agentId: string;
  runId: string;
  agentUrl: string | null;
  remainingQuota: number;
}): string {
  const lines = [
    "🛠️ השקתי סוכן קוד ב-Cursor.",
    `מזהה משימה: ${input.jobId}`,
    `סוכן: ${input.agentId}`,
    `ריצה: ${input.runId}`,
  ];
  if (input.agentUrl) lines.push(`קישור: ${input.agentUrl}`);
  lines.push(`נותרו היום: ${input.remainingQuota} מתוך 3.`);
  lines.push("אחרי CI ירוק ה-PR ימוזג אוטומטית ל-main.");
  return lines.join("\n");
}

/** Short-circuit handler for `קוד:` / `/dev` messages. Returns handled:false when not a coding task. */
export async function handleCodingTaskRequest(input: {
  message: string;
  channel: AgentChannel;
  logInbound?: boolean;
  inboundLogContent?: string;
  external_id?: string | null;
}): Promise<CodingBridgeResult> {
  const parsed = parseCodingTaskPrefix(input.message);
  if (parsed === null) return { handled: false };

  if (parsed === "") {
    const text = "נא לכתוב משימה אחרי הקידומת `קוד:` או `/dev`.";
    if (input.logInbound) {
      await logAgentMessage({
        direction: "inbound",
        channel: input.channel,
        content: input.inboundLogContent ?? input.message,
        external_id: input.external_id,
      });
    }
    await logAgentMessage({ direction: "outbound", channel: input.channel, content: text });
    return { handled: true, text };
  }

  if (input.logInbound) {
    await logAgentMessage({
      direction: "inbound",
      channel: input.channel,
      content: input.inboundLogContent ?? input.message,
      external_id: input.external_id,
    });
  }

  if (!isCursorCodingConfigured()) {
    const text =
      "גשר הקוד לא מוגדר (חסר CURSOR_API_KEY בשרת). הוסף מפתח ב-Vercel Production ועשה Redeploy.";
    await logAgentMessage({ direction: "outbound", channel: input.channel, content: text });
    return { handled: true, text };
  }

  const jobs = await listRecentCodingJobs();
  const quota = evaluateCodingQuota(jobs);
  if (quota.blockReason) {
    const text = formatQuotaBlockedHebrew(quota);
    await insertCodingJob({
      channel: input.channel,
      task_text: parsed,
      status: "blocked",
      blocked_reason: quota.blockReason,
    });
    await logAgentMessage({ direction: "outbound", channel: input.channel, content: text });
    return { handled: true, text, remainingQuota: quota.remainingToday };
  }

  try {
    const launch = await launchCursorCodingAgent(parsed);
    const job = await insertCodingJob({
      channel: input.channel,
      task_text: parsed,
      status: "launched",
      cursor_agent_id: launch.agentId,
      cursor_run_id: launch.runId,
      agent_url: launch.agentUrl,
    });

    const remainingQuota = Math.max(0, quota.remainingToday - 1);
    const text = formatLaunchAckHebrew({
      jobId: job.id,
      agentId: launch.agentId,
      runId: launch.runId,
      agentUrl: launch.agentUrl,
      remainingQuota,
    });
    await logAgentMessage({ direction: "outbound", channel: input.channel, content: text });
    return {
      handled: true,
      text,
      jobId: job.id,
      agentId: launch.agentId,
      agentUrl: launch.agentUrl ?? undefined,
      remainingQuota,
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : "cursor_launch_failed";
    console.error("[coding-bridge] launch_failed", code);
    const text = "לא הצלחתי להשיק סוכן קוד. נסה שוב מאוחר יותר.";
    await insertCodingJob({
      channel: input.channel,
      task_text: parsed,
      status: "failed",
      blocked_reason: code,
    });
    await logAgentMessage({ direction: "outbound", channel: input.channel, content: text });
    return { handled: true, text };
  }
}
