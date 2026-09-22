import { tool } from "ai";
import { z } from "zod";
import { withLog } from "@/lib/agent/tools-log";
import {
  agentCreateTask,
  agentListProjects,
  agentListTasks,
  agentUpdateTask,
} from "@/lib/agent/data";
import {
  buildAgentContext,
} from "@/lib/agent/context";

/** Tasks, projects, and the dashboard snapshot. */
export function createTaskAgentTools() {
  return {
    get_dashboard: tool({
      description: "Get a compact snapshot of habits, goals, tasks, relationships, events, commitments.",
      inputSchema: z.object({}),
      execute: async () => withLog("get_dashboard", {}, () => buildAgentContext()),
    }),


    list_tasks: tool({
      description: "List tasks. Defaults to open/in-progress items when no status filter.",
      inputSchema: z.object({
        status: z.enum(["open", "in_progress", "stuck", "review", "done"]).optional(),
        priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      execute: async (input) =>
        withLog("list_tasks", input, () =>
          agentListTasks({
            status: input.status,
            priority: input.priority,
            limit: input.limit,
          })
        ),
    }),


    update_task: tool({
      description: "Update a task status, priority, title, or notes by id.",
      inputSchema: z.object({
        id: z.string().uuid(),
        status: z.enum(["open", "in_progress", "stuck", "review", "done"]).optional(),
        priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
        title: z.string().min(1).optional(),
        notes: z.string().nullable().optional(),
      }),
      execute: async (input) =>
        withLog("update_task", input, () =>
          agentUpdateTask(input.id, {
            status: input.status,
            priority: input.priority,
            title: input.title,
            notes: input.notes,
          })
        ),
    }),


    create_task: tool({
      description:
        "Create a manual one-off task. Do NOT use for people/stay-in-touch — use create_relationship instead. Requires project_id from list_projects.",
      inputSchema: z.object({
        title: z.string().min(1),
        project_id: z.string().uuid(),
        priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
        due_date: z.string().nullable().optional(),
      }),
      execute: async (input) => withLog("create_task", input, () => agentCreateTask(input)),
    }),


    list_projects: tool({
      description: "List projects (id + name) for task creation.",
      inputSchema: z.object({}),
      execute: async () => withLog("list_projects", {}, () => agentListProjects()),
    }),
  };
}
