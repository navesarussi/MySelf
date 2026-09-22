import { tool } from "ai";
import { z } from "zod";
import { withLog } from "@/lib/agent/tools-log";
import {
  agentListGoals,
  agentListHabits,
  agentReportHabit,
  agentUpdateGoal,
} from "@/lib/agent/data";

/** Habits and goals. */
export function createHabitGoalAgentTools() {
  return {

    list_habits: tool({
      description: "List active habits with streak stats.",
      inputSchema: z.object({}),
      execute: async () => withLog("list_habits", {}, () => agentListHabits()),
    }),


    report_habit: tool({
      description: "Report daily habit: check_in (success) or fall (missed).",
      inputSchema: z.object({
        id: z.string().uuid(),
        type: z.enum(["check_in", "fall"]),
      }),
      execute: async (input) => withLog("report_habit", input, () => agentReportHabit(input.id, input.type)),
    }),


    list_goals: tool({
      description: "List goals by status.",
      inputSchema: z.object({
        status: z.enum(["active", "done"]).optional(),
      }),
      execute: async (input) =>
        withLog("list_goals", input, () => agentListGoals(input.status ?? "active")),
    }),


    update_goal: tool({
      description: "Update a goal title, first_step, or mark done/active.",
      inputSchema: z.object({
        id: z.string().uuid(),
        status: z.enum(["active", "done"]).optional(),
        title: z.string().min(1).optional(),
        first_step: z.string().nullable().optional(),
      }),
      execute: async (input) =>
        withLog("update_goal", input, () =>
          agentUpdateGoal(input.id, {
            status: input.status,
            title: input.title,
            first_step: input.first_step,
          })
        ),
    }),
  };
}
