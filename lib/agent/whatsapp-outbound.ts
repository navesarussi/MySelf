import { userDb } from "@/lib/db/user-db";
import { claimAgentMessage } from "@/lib/agent/whatsapp-claim";
import { sendWhatsAppText } from "@/lib/whatsapp/client";

const ERROR_HE: Record<string, string> = {
  whatsapp_not_configured:
    "שליחת WhatsApp לא מוגדרת בשרת (חסר טוקן). תבדוק Vercel → WHATSAPP_ACCESS_TOKEN.",
  missing_gemini_api_key:
    "מפתח Gemini חסר בשרת. תוסיף GOOGLE_GENERATIVE_AI_API_KEY ב-Vercel.",
  gemini_credits_depleted:
    "נגמרו כספי הקרדיט של Gemini. תטען מחדש ב-Google AI Studio (aistudio.google.com) ואז נסה שוב.",
  agent_timeout: "לקח לי יותר מדי זמן לענות. נסה שוב בהודעה קצרה אחת.",
  agent_error: "משהו נתקע בצד שלי. נסה שוב בעוד דקה.",
};

const KNOWN_ERROR_CODES = new Set(Object.keys(ERROR_HE));

function collectErrorText(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === "string") {
      parts.push(current);
      break;
    }
    if (current instanceof Error) {
      const e = current as Error & {
        cause?: unknown;
        statusCode?: number;
        status?: number;
        responseBody?: string;
      };
      parts.push(e.message);
      if (typeof e.statusCode === "number") parts.push(String(e.statusCode));
      if (typeof e.status === "number") parts.push(String(e.status));
      if (typeof e.responseBody === "string") parts.push(e.responseBody);
      current = e.cause;
      continue;
    }
    if (typeof current === "object") {
      const o = current as Record<string, unknown>;
      if (typeof o.message === "string") parts.push(o.message);
      if (typeof o.statusCode === "number") parts.push(String(o.statusCode));
      if (typeof o.status === "number") parts.push(String(o.status));
      if (typeof o.responseBody === "string") parts.push(o.responseBody);
      current = o.cause;
      continue;
    }
    break;
  }
  return parts.join(" ");
}

function isGeminiCreditsDepleted(err: unknown): boolean {
  const text = collectErrorText(err).toLowerCase();
  if (text.includes("prepayment credits are depleted")) return true;
  if (text.includes("credits are depleted")) return true;
  if (/\b402\b/.test(text) && /billing|credit|payment|prepayment/.test(text)) return true;
  return false;
}

/** Map thrown agent/Gemini errors to stable user-facing codes. */
export function mapAgentErrorCode(err: unknown): string {
  if (isGeminiCreditsDepleted(err)) return "gemini_credits_depleted";
  if (err instanceof Error && KNOWN_ERROR_CODES.has(err.message)) return err.message;
  return "agent_error";
}

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
  await (await userDb())
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
