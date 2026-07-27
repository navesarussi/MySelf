import { normalizePhone } from "@/lib/integrations/phone";

const GRAPH = "https://graph.facebook.com/v21.0";

export type WhatsAppSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; configured: boolean };

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Send a plain-text WhatsApp message via Meta Cloud API. */
export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, error: "whatsapp_not_configured", configured: false };
  }

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body },
    }),
  });

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message || `http_${res.status}`,
      configured: true,
    };
  }

  return { ok: true, messageId: data.messages?.[0]?.id || "unknown" };
}

/** Send a template WhatsApp message (for business-initiated digs). */
export async function sendWhatsAppTemplate(input: {
  to: string;
  name: string;
  languageCode: string;
  bodyParams?: string[];
}): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, error: "whatsapp_not_configured", configured: false };
  }

  const components =
    input.bodyParams && input.bodyParams.length
      ? [
          {
            type: "body",
            parameters: input.bodyParams.map((text) => ({ type: "text", text })),
          },
        ]
      : undefined;

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(input.to),
      type: "template",
      template: {
        name: input.name,
        language: { code: input.languageCode },
        ...(components ? { components } : {}),
      },
    }),
  });

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      ok: false,
      error: data.error?.message || `http_${res.status}`,
      configured: true,
    };
  }

  return { ok: true, messageId: data.messages?.[0]?.id || "unknown" };
}

/** Prefer free text; if outside 24h window, fall back to Utility template. */
export async function sendWhatsAppDig(to: string, digText: string): Promise<WhatsAppSendResult & { via?: string }> {
  const text = digText.replace(/\s+/g, " ").trim().slice(0, 200);
  const direct = await sendWhatsAppText(to, digText.trim().slice(0, 1500));
  if (direct.ok) return { ...direct, via: "text" };

  const templateName = process.env.WHATSAPP_DIG_TEMPLATE || "myself_daily_reminder";
  const language = process.env.WHATSAPP_DIG_TEMPLATE_LANG || "he";
  const templated = await sendWhatsAppTemplate({
    to,
    name: templateName,
    languageCode: language,
    bodyParams: [text || "יש עדכון בחשבון MySelf שלך"],
  });
  if (templated.ok) return { ...templated, via: "template" };
  return { ...templated, via: "template_failed", error: `${direct.error} | ${templated.error}` };
}

export function verifyWhatsAppWebhook(searchParams: URLSearchParams): string | null {
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && challenge && expected && token === expected) {
    return challenge;
  }
  return null;
}

export type InboundWhatsAppText = {
  from: string;
  messageId: string;
  text: string;
};

export {
  parseInboundWhatsAppMessage,
  parseInboundWhatsAppText,
  downloadWhatsAppMedia,
} from "@/lib/whatsapp/inbound";

