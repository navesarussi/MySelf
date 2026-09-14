import type { AgentChannel } from "@/lib/agent/types";

export const CODING_TASK_DAILY_LIMIT = 3;
export const CODING_TASK_COOLDOWN_MINUTES = 30;
export const CODING_TASK_IN_FLIGHT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const MYSELF_REPO_URL = "https://github.com/navesarussi/MySelf";

export type CodingJobStatus =
  | "blocked"
  | "launched"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type CodingAgentJob = {
  id: string;
  channel: AgentChannel;
  task_text: string;
  status: CodingJobStatus;
  cursor_agent_id: string | null;
  cursor_run_id: string | null;
  agent_url: string | null;
  pr_url: string | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type QuotaBlockReason = "daily_limit" | "in_flight" | "cooldown";

export type QuotaSnapshot = {
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  inFlight: boolean;
  cooldownMinutesLeft: number;
  blockReason: QuotaBlockReason | null;
};

export type CodingBridgeResult =
  | { handled: false }
  | {
      handled: true;
      text: string;
      jobId?: string;
      agentId?: string;
      agentUrl?: string;
      remainingQuota?: number;
    };
