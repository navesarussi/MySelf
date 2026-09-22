import { getSupabase } from "@/lib/supabase";
import { claimAgentMessage } from "@/lib/agent/whatsapp-claim";
import { shouldSend, recordSend } from "@/lib/push/should-send";
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
  await getSupabase()
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

/** One proactive dig per kind per Jerusalem day. */
export async function shouldSendMotivationDig(
  kind: MotivationKind,
  now = new Date()
): Promise<{ ok: true; dayKey: string } | { ok: false; reason: string }> {
  const gate = await shouldSend("agent", DIG_REF[kind], now, { bypassQuiet: true });
  if (!gate.ok) return { ok: false, reason: gate.reason };
  return { ok: true, dayKey: gate.dayKey };
}

export async function recordMotivationDig(
  kind: MotivationKind,
  dayKey: string,
  text: string
): Promise<void> {
  await recordSend({
    type: "agent",
    refId: DIG_REF[kind],
    dayKey,
    title: `WhatsApp ${kind} dig`,
    body: text.slice(0, 500),
  });
}
