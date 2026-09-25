import { userDb } from "@/lib/db/user-db";
import { claimAgentMessage } from "@/lib/agent/whatsapp-claim";
import { shouldSend } from "@/lib/push/should-send";
import { claimSend, releaseSend, sendLogClient } from "@/lib/push/claim";
import type { MotivationKind } from "@/lib/agent/types";

export type InboundClaimResult = "claimed" | "duplicate" | "error";

/** Claim a WhatsApp inbound message id before processing. */
export async function claimWhatsAppInbound(messageId: string): Promise<InboundClaimResult> {
  return claimAgentMessage({
    externalId: messageId,
    direction: "inbound",
    placeholder: "[processing]",
    logTag: "whatsapp-dedup",
  });
}

export async function finalizeWhatsAppInbound(messageId: string, content: string): Promise<void> {
  await (await userDb())
    .from("agent_messages")
    .update({ content })
    .eq("external_id", messageId)
    .eq("direction", "inbound")
    .eq("channel", "whatsapp");
}

const DIG_REF: Record<MotivationKind, string> = {
  morning: "dig:morning",
  midday: "dig:midday",
  evening: "dig:evening",
};

/**
 * One proactive dig per kind per Jerusalem day.
 *
 * The slot is claimed *before* the Gemini call, not after the WhatsApp send.
 * Reading first and writing last left the whole generate-and-send in between,
 * so two overlapping cron invocations both generated a dig — paying twice for
 * the model — and both sent it.
 */
export async function claimMotivationDig(
  kind: MotivationKind,
  now = new Date()
): Promise<{ ok: true; dayKey: string } | { ok: false; reason: string }> {
  const gate = await shouldSend("agent", DIG_REF[kind], now, { bypassQuiet: true });
  if (!gate.ok) return { ok: false, reason: gate.reason };
  const claimed = await claimSend(await sendLogClient(), {
    type: "agent",
    refId: DIG_REF[kind],
    dayKey: gate.dayKey,
    title: `WhatsApp ${kind} dig`,
    body: "",
  });
  if (!claimed) return { ok: false, reason: "duplicate" };
  return { ok: true, dayKey: gate.dayKey };
}

/** Nothing was sent — free the slot so the next cron slot can try again. */
export async function releaseMotivationDig(kind: MotivationKind, dayKey: string): Promise<void> {
  await releaseSend(await sendLogClient(), {
    type: "agent",
    refId: DIG_REF[kind],
    dayKey,
    title: "",
    body: "",
  }).catch(() => undefined);
}

/** Record what was actually sent, over the placeholder written by the claim. */
export async function recordMotivationDig(
  kind: MotivationKind,
  dayKey: string,
  text: string
): Promise<void> {
  await (await userDb())
    .from("notification_log")
    .update({ body: text.slice(0, 500) })
    .eq("notif_type", "agent")
    .eq("ref_id", DIG_REF[kind])
    .eq("day_key", dayKey);
}
