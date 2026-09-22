import { tool } from "ai";
import { z } from "zod";
import { withLog } from "@/lib/agent/tools-log";
import {
  agentCreateCommitment,
  agentListCommitments,
  agentUpdateCommitment,
} from "@/lib/agent/data";

/** Daily commitments. */
export function createCommitmentAgentTools() {
  return {

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
  };
}
