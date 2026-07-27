import { tool } from "ai";
import { z } from "zod";
import { logAgentAction } from "@/lib/agent/log";
import {
  agentCreateCommitment,
  agentCreateRelationship,
  agentCreateTask,
  agentGetDigSchedule,
  agentListCommitments,
  agentListGoals,
  agentListHabits,
  agentListProjects,
  agentListRelationships,
  agentListTasks,
  agentReportHabit,
  agentTouchRelationship,
  agentUpdateCommitment,
  agentUpdateDigSchedule,
  agentUpdateGoal,
  agentUpdateRelationship,
  agentUpdateTask,
} from "@/lib/agent/data";
import { buildAgentContext } from "@/lib/agent/context";
import { createExtraAgentTools } from "@/lib/agent/tools-extra";
import { createGmailAgentTools } from "@/lib/agent/tools-gmail";

async function withLog<T>(name: string, input: unknown, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    await logAgentAction({ tool_name: name, tool_input: input, tool_result: result });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool_failed";
    await logAgentAction({ tool_name: name, tool_input: input, tool_result: { error: message } });
    throw err;
  }
}

export function createAgentTools() {
  return {
    ...createExtraAgentTools(),
    ...createGmailAgentTools(),
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

    list_commitments: tool({
      description: "List commitments, optionally for a specific date (YYYY-MM-DD).",
      inputSchema: z.object({
        date: z.string().optional(),
      }),
      execute: async (input) => withLog("list_commitments", input, () => agentListCommitments(input.date)),
    }),

    create_commitment: tool({
      description: "Create a daily commitment.",
      inputSchema: z.object({
        text: z.string().min(1),
        date: z.string(),
      }),
      execute: async (input) =>
        withLog("create_commitment", input, () => agentCreateCommitment(input.text, input.date)),
    }),

    update_commitment: tool({
      description: "Mark a commitment pending, done, or missed.",
      inputSchema: z.object({
        id: z.string().uuid(),
        status: z.enum(["pending", "done", "missed"]),
      }),
      execute: async (input) =>
        withLog("update_commitment", input, () => agentUpdateCommitment(input.id, input.status)),
    }),

    list_relationships: tool({
      description:
        "List relationship/contact cards (שמירת קשר) with reminder_days cadence. Use this — not tasks — for people to stay in touch with.",
      inputSchema: z.object({}),
      execute: async () => withLog("list_relationships", {}, () => agentListRelationships()),
    }),

    create_relationship: tool({
      description:
        "Create a relationship/contact card in the app (appears under קשרים). Use for stay-in-touch people. Requires project_id from list_projects. Default reminder_days=7.",
      inputSchema: z.object({
        name: z.string().min(1),
        project_id: z.string().uuid(),
        reminder_days: z.number().int().min(1).max(365).optional(),
        notes: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        group_name: z.string().nullable().optional(),
      }),
      execute: async (input) => withLog("create_relationship", input, () => agentCreateRelationship(input)),
    }),

    update_relationship: tool({
      description: "Update a relationship card: name, reminder_days, notes, phone, or last_contact_date.",
      inputSchema: z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        reminder_days: z.number().int().min(1).max(365).nullable().optional(),
        notes: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        last_contact_date: z.string().nullable().optional(),
      }),
      execute: async (input) =>
        withLog("update_relationship", input, () =>
          agentUpdateRelationship(input.id, {
            name: input.name,
            reminder_days: input.reminder_days,
            notes: input.notes,
            phone: input.phone,
            last_contact_date: input.last_contact_date,
          })
        ),
    }),

    touch_relationship: tool({
      description: "Record that you contacted someone today (updates last_contact_date).",
      inputSchema: z.object({
        id: z.string().uuid(),
        date: z.string(),
      }),
      execute: async (input) =>
        withLog("touch_relationship", input, () => agentTouchRelationship(input.id, input.date)),
    }),

    get_dig_schedule: tool({
      description: "Get WhatsApp dig/reminder schedule (Jerusalem hours, up to 6 slots).",
      inputSchema: z.object({}),
      execute: async () => withLog("get_dig_schedule", {}, () => agentGetDigSchedule()),
    }),

    update_dig_schedule: tool({
      description:
        "Set dig hours (Asia/Jerusalem, 0–23). Pass dig_hours array with 1–6 unique hours, e.g. [8,13,18,21]. Or set morning/midday/evening individually.",
      inputSchema: z.object({
        dig_hours: z.array(z.number().int().min(0).max(23)).min(1).max(6).optional(),
        morning_hour: z.number().int().min(0).max(23).optional(),
        midday_hour: z.number().int().min(0).max(23).optional(),
        evening_hour: z.number().int().min(0).max(23).optional(),
      }),
      execute: async (input) =>
        withLog("update_dig_schedule", input, () =>
          agentUpdateDigSchedule({
            dig_hours: input.dig_hours,
            morning_hour: input.morning_hour,
            midday_hour: input.midday_hour,
            evening_hour: input.evening_hour,
          })
        ),
    }),
  };
}

export type AgentTools = ReturnType<typeof createAgentTools>;
