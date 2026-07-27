import { recordSend, shouldSend } from "@/lib/push/should-send";
import { sendPush } from "@/lib/push/send";
import type { NotificationType, PushPayload, PushSendResult } from "@/lib/push/types";

export type NotifyResult =
  | { ok: true; result: PushSendResult }
  | { ok: false; reason: string };

/** Gate + send + log. Used by cron dispatch, agent motivate, and test route. */
export async function notifyUser(
  type: NotificationType,
  payload: PushPayload,
  refId = "",
  opts?: { bypassQuiet?: boolean }
): Promise<NotifyResult> {
  const gate = await shouldSend(type, refId, new Date(), opts);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  const result = await sendPush(payload);
  if (result.sent > 0) {
    await recordSend({
      type,
      refId,
      dayKey: gate.dayKey,
      title: payload.title,
      body: payload.body,
    });
  }
  return { ok: true, result };
}
