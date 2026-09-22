import { getSupabase } from "@/lib/supabase";
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
  const sb = getSupabase();
  const ref = outboundRef(inboundId);
  const { data: existing } = await sb
    .from("agent_messages")
    .select("id")
    .eq("external_id", ref)
    .eq("direction", "outbound")
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (existing) return "duplicate";

  const { error } = await sb.from("agent_messages").insert({
    direction: "outbound",
    channel: "whatsapp",
    content: "[sending]",
    external_id: ref,
  });
  if (!error) return "claimed";
  if (error.code === "23505") return "duplicate";
  console.error("[whatsapp-outbound] claim_failed", error.message);
  return "error";
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
