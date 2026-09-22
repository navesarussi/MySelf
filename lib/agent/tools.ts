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
export function createAgentTools() {
  return {
    ...createExtraAgentTools(),
    ...createFinanceAgentTools(),
    ...createGmailAgentTools(),
    ...createTaskAgentTools(),
    ...createHabitGoalAgentTools(),
    ...createCommitmentAgentTools(),
    ...createRelationshipAgentTools(),
    ...createScheduleAgentTools(),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
