import { tool } from "ai";
import { z } from "zod";
import { withLog } from "@/lib/agent/tools-log";
import {
  agentCreateRelationship,
  agentListRelationships,
  agentTouchRelationship,
  agentUpdateRelationship,
} from "@/lib/agent/data";
import {
  agentBulkCreateRelationships,
} from "@/lib/agent/data-bulk";

/** Relationship / stay-in-touch cards (שמירת קשר). */
export function createRelationshipAgentTools() {
  return {

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


    bulk_create_relationships: tool({
      description:
        "Create multiple relationship/contact cards at once (שמירת קשר). Use when user lists people to stay in touch with.",
      inputSchema: z.object({
        names: z.array(z.string().min(1)).min(1).max(30),
        project_id: z.string().uuid(),
        reminder_days: z.number().int().min(1).max(365).optional(),
      }),
      execute: async (input) =>
        withLog("bulk_create_relationships", input, () => agentBulkCreateRelationships(input)),
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
  };
}
