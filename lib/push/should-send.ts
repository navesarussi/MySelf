import { getSupabase } from "@/lib/supabase";
import { getNotificationPreferences, isTypeEnabled } from "@/lib/push/preferences";
import { isQuietHour, jerusalemParts } from "@/lib/push/time";
import type { NotificationType } from "@/lib/push/types";

export type ShouldSendResult =
  | { ok: true; dayKey: string }
  | { ok: false; reason: "disabled" | "quiet" | "duplicate" };

/** Check preferences, quiet hours, and same-day dedup. */
export async function shouldSend(
  type: NotificationType,
  refId = "",
  now = new Date(),
  opts?: { bypassQuiet?: boolean }
): Promise<ShouldSendResult> {
  const prefs = await getNotificationPreferences();
  if (!isTypeEnabled(prefs, type)) return { ok: false, reason: "disabled" };

  const { dayKey, hour } = jerusalemParts(now);
  if (
    !opts?.bypassQuiet &&
    type !== "test" &&
    isQuietHour(hour, prefs.quiet_start_hour, prefs.quiet_end_hour)
  ) {
    return { ok: false, reason: "quiet" };
  }

  const { data } = await getSupabase()
    .from("notification_log")
    .select("id")
    .eq("notif_type", type)
    .eq("ref_id", refId)
    .eq("day_key", dayKey)
    .maybeSingle();

  if (data) return { ok: false, reason: "duplicate" };
  return { ok: true, dayKey };
}

export async function recordSend(input: {
  type: NotificationType;
  refId?: string;
  dayKey: string;
  title: string;
  body: string;
}): Promise<void> {
  await getSupabase().from("notification_log").upsert(
    {
      notif_type: input.type,
      ref_id: input.refId ?? "",
      day_key: input.dayKey,
      title: input.title,
      body: input.body,
    },
    { onConflict: "notif_type,ref_id,day_key", ignoreDuplicates: true }
  );
}
