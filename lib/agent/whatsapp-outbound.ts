import { getSupabase } from "@/lib/supabase";
import { claimAgentMessage } from "@/lib/agent/whatsapp-claim";
import { sendWhatsAppText } from "@/lib/whatsapp/client";

const ERROR_HE: Record<string, string> = {
  whatsapp_not_configured:
    "שליחת WhatsApp לא מוגדרת בשרת (חסר טוקן). תבדוק Vercel → WHATSAPP_ACCESS_TOKEN.",
  missing_gemini_api_key:
    "מפתח Gemini חסר בשרת. תוסיף GOOGLE_GENERATIVE_AI_API_KEY ב-Vercel.",
  agent_timeout: "לקח לי יותר מדי זמן לענות. נסה שוב בהודעה קצרה אחת.",
  agent_error: "משהו נתקע בצד שלי. נסה שוב בעוד דקה.",
};

export function outboundRef(inboundId: string): string {
  return `out:${inboundId}`;
}

export function userFacingAgentError(code: string): string {
  return ERROR_HE[code] ?? ERROR_HE.agent_error;
}

export async function claimWhatsAppOutbound(
  inboundId: string
): Promise<"claimed" | "duplicate" | "error"> {
  return claimAgentMessage({
    externalId: outboundRef(inboundId),
    direction: "outbound",
    placeholder: "[sending]",
    logTag: "whatsapp-outbound",
  });
}

export async function recordWhatsAppOutbound(
  inboundId: string,
  content: string,
  waMessageId: string
): Promise<void> {
  await getSupabase()
    .from("agent_messages")
    .update({ content: `${content}\n[wa:${waMessageId}]` })
    .eq("external_id", outboundRef(inboundId))
    .eq("direction", "outbound")
    .eq("channel", "whatsapp");
}

/** Send exactly one reply per inbound wamid. */
export async function sendWhatsAppReplyOnce(
  to: string,
  inboundId: string,
  body: string
): Promise<{ ok: boolean; skipped?: string }> {
  const claim = await claimWhatsAppOutbound(inboundId);
  if (claim === "duplicate") return { ok: true, skipped: "duplicate_outbound" };
  if (claim === "error") return { ok: false, skipped: "claim_error" };

  const sent = await sendWhatsAppText(to, body);
  if (!sent.ok) return { ok: false, skipped: sent.error };

  await recordWhatsAppOutbound(inboundId, body, sent.messageId);
  return { ok: true };
}
