import { agentCreateRelationship } from "@/lib/agent/data";
import { agentUpdateHabit } from "@/lib/agent/data-extra";

export function parseContactNamesFromHebrewList(raw: string): string[] {
  return raw
    .split(/\n|,|;/)
    .map((line) => line.replace(/^עם\s+/i, "").trim())
    .filter(Boolean);
}

export async function agentBulkCreateRelationships(input: {
  names: string[];
  project_id: string;
  reminder_days?: number;
}) {
  const created = [];
  const skipped: string[] = [];
  for (const name of input.names) {
    try {
      created.push(
        await agentCreateRelationship({
          name,
          project_id: input.project_id,
          reminder_days: input.reminder_days ?? 7,
        })
      );
    } catch {
      skipped.push(name);
    }
  }
  return { created_count: created.length, created, skipped };
}

export async function agentBulkUpdateHabits(
  updates: Array<{ id: string; report_time?: string | null }>
) {
  const updated = [];
  for (const u of updates) {
    updated.push(await agentUpdateHabit(u.id, { report_time: u.report_time }));
  }
  return { updated_count: updated.length, updated };
}
