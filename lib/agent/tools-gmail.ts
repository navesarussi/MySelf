import { tool } from "ai";
import { z } from "zod";
import { logAgentAction } from "@/lib/agent/log";
import { agentCreateTaskFromEmail, agentListEmails, agentReadEmail } from "@/lib/agent/gmail";

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

/** Gmail read tools for the motivation agent. */
export function createGmailAgentTools() {
  return {
    list_emails: tool({
      description:
        "List recent Gmail messages (read-only). Optional Gmail search query q (e.g. is:unread, from:boss@co.com). Requires Gmail connected in Settings.",
      inputSchema: z.object({
        q: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async (input) => withLog("list_emails", input, () => agentListEmails(input)),
    }),

    read_email: tool({
      description: "Read a Gmail message body by id from list_emails. Read-only.",
      inputSchema: z.object({
        id: z.string().min(1),
      }),
      execute: async (input) => withLog("read_email", input, () => agentReadEmail(input.id)),
    }),

    create_task_from_email: tool({
      description:
        "Create a MySelf task from a Gmail message id (from list_emails). Skips if task already exists for that email. Use when user asks to turn an email into a task / follow up on mail.",
      inputSchema: z.object({
        email_id: z.string().min(1),
        title: z.string().min(1).optional(),
        priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
        due_date: z.string().nullable().optional(),
      }),
      execute: async (input) =>
        withLog("create_task_from_email", input, () => agentCreateTaskFromEmail(input)),
    }),
  };
}
