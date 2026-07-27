import { getSupabase } from "@/lib/supabase";
import type { NotificationPreferences, NotificationType } from "@/lib/push/types";

const DEFAULTS: NotificationPreferences = {
  enabled: true,
  agent: true,
  relationships: true,
  habits: true,
  tasks: true,
  timeline: true,
  quiet_start_hour: 22,
  quiet_end_hour: 7,
  updated_at: new Date().toISOString(),
};

function rowToPrefs(row: Record<string, unknown>): NotificationPreferences {
  return {
    enabled: Boolean(row.enabled),
    agent: Boolean(row.agent),
    relationships: Boolean(row.relationships),
    habits: Boolean(row.habits),
    tasks: Boolean(row.tasks),
    timeline: Boolean(row.timeline),
    quiet_start_hour: Number(row.quiet_start_hour ?? 22),
    quiet_end_hour: Number(row.quiet_end_hour ?? 7),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await getSupabase()
    .from("notification_preferences")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return rowToPrefs(data as Record<string, unknown>);
}

export type NotificationPreferencesPatch = Partial<
  Omit<NotificationPreferences, "updated_at">
>;

export async function updateNotificationPreferences(
  patch: NotificationPreferencesPatch
): Promise<NotificationPreferences> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    "enabled",
    "agent",
    "relationships",
    "habits",
    "tasks",
    "timeline",
  ] as const) {
    if (patch[key] !== undefined) body[key] = Boolean(patch[key]);
  }
  if (patch.quiet_start_hour !== undefined) {
    const h = Number(patch.quiet_start_hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error("invalid_quiet_start");
    body.quiet_start_hour = h;
  }
  if (patch.quiet_end_hour !== undefined) {
    const h = Number(patch.quiet_end_hour);
    if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error("invalid_quiet_end");
    body.quiet_end_hour = h;
  }

  const { data, error } = await getSupabase()
    .from("notification_preferences")
    .update(body)
    .eq("id", true)
    .select("*")
    .single();
  if (error || !data) throw new Error("preferences_update_failed");
  return rowToPrefs(data as Record<string, unknown>);
}

export function isTypeEnabled(
  prefs: NotificationPreferences,
  type: NotificationType
): boolean {
  if (type === "test") return true;
  if (!prefs.enabled) return false;
  return Boolean(prefs[type]);
}
