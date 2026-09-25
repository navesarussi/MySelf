/**
 * Tables whose rows belong to one account. Everything else in the `myself`
 * schema is either shared by every allowlisted account (finance) or system
 * state with no owner (trading, coding jobs, the allowlist itself).
 */
export const PERSONAL_TABLES = [
  "timeline_events",
  "timeline_event_links",
  "habits",
  "habit_reports",
  "goals",
  "commitments",
  "life_periods",
  "content_entries",
  "relationships",
  "tasks",
  "projects",
  "agent_settings",
  "agent_messages",
  "agent_actions",
  "notification_preferences",
  "notification_log",
  "push_tokens",
  "integration_tokens",
] as const;

export type PersonalTable = (typeof PERSONAL_TABLES)[number];

const PERSONAL: ReadonlySet<string> = new Set(PERSONAL_TABLES);

export function isPersonalTable(table: string): table is PersonalTable {
  return PERSONAL.has(table);
}
