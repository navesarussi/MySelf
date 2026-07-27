import { tool } from "ai";
import { z } from "zod";
import { logAgentAction } from "@/lib/agent/log";
import {
  agentCreateEvent,
  agentCreateGoal,
  agentCreateHabit,
  agentCreateLibraryEntry,
  agentCreatePeriod,
  agentListEvents,
  agentListLibrary,
  agentListPeriods,
  agentUpdateEvent,
  agentUpdateHabit,
  agentUpdateLibraryEntry,
  agentUpdatePeriod,
} from "@/lib/agent/data-extra";

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

/** Extra entity tools: habits write, goals create, library, timeline events/periods. */
export function createExtraAgentTools() {
  return {
    create_habit: tool({
      description: "Create a habit (build or quit).",
      inputSchema: z.object({
        name: z.string().min(1),
        kind: z.enum(["build", "quit"]).optional(),
        target_note: z.string().nullable().optional(),
        report_time: z.string().nullable().optional(),
      }),
      execute: async (input) => withLog("create_habit", input, () => agentCreateHabit(input)),
    }),

    update_habit: tool({
      description: "Update habit name/kind/notes/report_time, or archive it.",
      inputSchema: z.object({
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        kind: z.enum(["build", "quit"]).optional(),
        target_note: z.string().nullable().optional(),
        report_time: z.string().nullable().optional(),
        archived: z.boolean().optional(),
      }),
      execute: async (input) =>
        withLog("update_habit", input, () =>
          agentUpdateHabit(input.id, {
            name: input.name,
            kind: input.kind,
            target_note: input.target_note,
            report_time: input.report_time,
            archived: input.archived,
          })
        ),
    }),

    create_goal: tool({
      description: "Create a goal/dream (מטרות וחלומות).",
      inputSchema: z.object({
        title: z.string().min(1),
        category: z.string().nullable().optional(),
        horizon: z.string().nullable().optional(),
        first_step: z.string().nullable().optional(),
        definition_of_done: z.string().nullable().optional(),
      }),
      execute: async (input) => withLog("create_goal", input, () => agentCreateGoal(input)),
    }),

    list_library: tool({
      description: "List content library entries (ספריית תוכן). Optional search q / category.",
      inputSchema: z.object({
        q: z.string().optional(),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
      execute: async (input) => withLog("list_library", input, () => agentListLibrary(input)),
    }),

    create_library_entry: tool({
      description: "Create a library content entry (title + body).",
      inputSchema: z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async (input) => withLog("create_library_entry", input, () => agentCreateLibraryEntry(input)),
    }),

    update_library_entry: tool({
      description: "Update a library entry title/body/category/tags.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
      execute: async (input) =>
        withLog("update_library_entry", input, () =>
          agentUpdateLibraryEntry(input.id, {
            title: input.title,
            body: input.body,
            category: input.category,
            tags: input.tags,
          })
        ),
    }),

    list_events: tool({
      description: "List timeline events (optional from/to YYYY-MM-DD).",
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async (input) => withLog("list_events", input, () => agentListEvents(input)),
    }),

    create_event: tool({
      description: "Create a manual timeline event.",
      inputSchema: z.object({
        title: z.string().min(1),
        event_date: z.string(),
        event_time: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
      }),
      execute: async (input) => withLog("create_event", input, () => agentCreateEvent(input)),
    }),

    update_event: tool({
      description: "Update a timeline event (Google events use local overrides).",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        event_date: z.string().optional(),
        event_time: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
      }),
      execute: async (input) =>
        withLog("update_event", input, () =>
          agentUpdateEvent(input.id, {
            title: input.title,
            event_date: input.event_date,
            event_time: input.event_time,
            description: input.description,
            category: input.category,
          })
        ),
    }),

    list_periods: tool({
      description: "List life periods on the timeline (תקופות בחיים).",
      inputSchema: z.object({}),
      execute: async () => withLog("list_periods", {}, () => agentListPeriods()),
    }),

    create_period: tool({
      description: "Create a life period band (title + start_date, optional end_date).",
      inputSchema: z.object({
        title: z.string().min(1),
        start_date: z.string(),
        end_date: z.string().nullable().optional(),
        color: z.string().optional(),
        kind: z.string().optional(),
      }),
      execute: async (input) => withLog("create_period", input, () => agentCreatePeriod(input)),
    }),

    update_period: tool({
      description: "Update a life period title/dates/color/kind.",
      inputSchema: z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        start_date: z.string().optional(),
        end_date: z.string().nullable().optional(),
        color: z.string().optional(),
        kind: z.string().optional(),
      }),
      execute: async (input) =>
        withLog("update_period", input, () =>
          agentUpdatePeriod(input.id, {
            title: input.title,
            start_date: input.start_date,
            end_date: input.end_date,
            color: input.color,
            kind: input.kind,
          })
        ),
    }),
  };
}
