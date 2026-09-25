import { claimSend, releaseSend, sendLogClient } from "@/lib/push/claim";
import { shouldSend } from "@/lib/push/should-send";
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

  // Claim the day's slot before sending, not after. Reading then sending then
  // writing let two overlapping runs both read "not sent yet" and both push.
  const entry = { type, refId, dayKey: gate.dayKey, title: payload.title, body: payload.body };
  const client = await sendLogClient();
  if (!(await claimSend(client, entry))) return { ok: false, reason: "duplicate" };

  const result = await sendPush(payload).catch(
    (): PushSendResult => ({ sent: 0, failed: 0, removedTokens: [] })
  );
  // Nothing was delivered, so the slot was not really used — free it or the
  // notification is lost for the rest of the day.
  if (result.sent === 0) await releaseSend(client, entry).catch(() => undefined);
  return { ok: true, result };
}
