import { tool } from "ai";
import { z } from "zod";
import { withLog } from "@/lib/agent/tools-log";
import {
  agentGetDigSchedule,
  agentUpdateDigSchedule,
} from "@/lib/agent/data";

/** WhatsApp dig / reminder schedule. */
export function createScheduleAgentTools() {
  return {

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
