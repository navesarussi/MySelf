import { createCommitmentAgentTools } from "@/lib/agent/tools-commitments";
import { createExtraAgentTools } from "@/lib/agent/tools-extra";
import { createFinanceAgentTools } from "@/lib/agent/tools-finance";
import { createGmailAgentTools } from "@/lib/agent/tools-gmail";
import { createHabitGoalAgentTools } from "@/lib/agent/tools-habits-goals";
import { createRelationshipAgentTools } from "@/lib/agent/tools-relationships";
import { createScheduleAgentTools } from "@/lib/agent/tools-schedule";
import { createTaskAgentTools } from "@/lib/agent/tools-tasks";

/**
 * The agent's full tool surface, composed from one module per domain.
 *
 * Everything used to be appended to a single object literal here, which grew
 * past the file-size limit and made every new tool a merge conflict in the same
 * few lines. Extra/finance/Gmail were already split out this way; the rest now
 * follow the same shape.
 */
const READ_ONLY_TOOL_NAMES = new Set([
  "get_dashboard",
  "list_tasks",
  "list_projects",
  "list_habits",
  "list_goals",
  "list_commitments",
  "list_relationships",
  "list_events",
  "list_library",
  "list_periods",
  "list_emails",
  "read_email",
  "list_wealth",
  "get_dig_schedule",
]);

export type AgentToolsMode = "read" | "full";

export function createAgentTools(opts?: { mode?: AgentToolsMode }) {
  const all = {
    ...createExtraAgentTools(),
    ...createFinanceAgentTools(),
    ...createGmailAgentTools(),
    ...createTaskAgentTools(),
    ...createHabitGoalAgentTools(),
    ...createCommitmentAgentTools(),
    ...createRelationshipAgentTools(),
    ...createScheduleAgentTools(),
  };

  if (opts?.mode !== "read") return all;

  return Object.fromEntries(
    Object.entries(all).filter(([name]) => READ_ONLY_TOOL_NAMES.has(name))
  ) as typeof all;
}

export type AgentTools = ReturnType<typeof createAgentTools>;
