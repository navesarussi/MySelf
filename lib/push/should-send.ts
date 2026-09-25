import { userDb } from "@/lib/db/user-db";
import { getNotificationPreferences, isTypeEnabled } from "@/lib/push/preferences";
import { isQuietHour, jerusalemParts } from "@/lib/push/time";
import type { NotificationType } from "@/lib/push/types";

export type ShouldSendResult =
  | { ok: true; dayKey: string }
  | { ok: false; reason: "disabled" | "quiet" | "duplicate" };

/**
 * Preferences, quiet hours, and a cheap same-day read.
 *
 * The read is an early exit, not the gate: `claimSend` decides, because only
 * the unique index can. Callers must claim before sending — a check here that
 * says "not sent yet" is true when it is read and can stop being true a
 * millisecond later.
 */
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

  const { data } = await (await userDb())
    .from("notification_log")
    .select("id")
    .eq("notif_type", type)
    .eq("ref_id", refId)
    .eq("day_key", dayKey)
    .maybeSingle();

  if (data) return { ok: false, reason: "duplicate" };
  return { ok: true, dayKey };
}
