import { normalizePhone } from "@/lib/integrations/phone";

const GRAPH = "https://graph.facebook.com/v21.0";

export type InboundWhatsAppMessage = {
  from: string;
  messageId: string;
  kind: "text" | "audio";
  text?: string;
  audioMediaId?: string;
  audioMimeType?: string;
};

function firstMessage(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const entry = Array.isArray(root.entry) ? root.entry[0] : null;
  if (!entry || typeof entry !== "object") return null;
  const changesRaw = (entry as Record<string, unknown>).changes;
  const changes = Array.isArray(changesRaw) ? changesRaw[0] : null;
  if (!changes || typeof changes !== "object") return null;
  const value = (changes as Record<string, unknown>).value;
  if (!value || typeof value !== "object") return null;
  const messagesRaw = (value as Record<string, unknown>).messages;
  const messages = Array.isArray(messagesRaw) ? messagesRaw[0] : null;
  if (!messages || typeof messages !== "object") return null;
  return messages as Record<string, unknown>;
}

/** Parse Meta webhook for inbound text or audio (voice note). */
export function parseInboundWhatsAppMessage(body: unknown): InboundWhatsAppMessage | null {
  const msg = firstMessage(body);
  if (!msg) return null;
  const from = String(msg.from || "");
  const messageId = String(msg.id || "");
  if (!from || !messageId) return null;

  if (msg.type === "text") {
    const textObj = msg.text;
    if (!textObj || typeof textObj !== "object") return null;
    const text = String((textObj as Record<string, unknown>).body || "").trim();
    if (!text) return null;
    return { from, messageId, kind: "text", text };
  }

  if (msg.type === "audio") {
    const audio = msg.audio;
    if (!audio || typeof audio !== "object") return null;
    const audioObj = audio as Record<string, unknown>;
    const audioMediaId = String(audioObj.id || "");
    if (!audioMediaId) return null;
    return {
      from,
      messageId,
      kind: "audio",
      audioMediaId,
      audioMimeType: typeof audioObj.mime_type === "string" ? audioObj.mime_type : "audio/ogg",
    };
  }

  return null;
}

/** @deprecated use parseInboundWhatsAppMessage */
export function parseInboundWhatsAppText(body: unknown) {
  const parsed = parseInboundWhatsAppMessage(body);
  if (!parsed || parsed.kind !== "text" || !parsed.text) return null;
  return { from: parsed.from, messageId: parsed.messageId, text: parsed.text };
}

/** Download WhatsApp Cloud API media bytes by media id. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("whatsapp_not_configured");

  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; error?: { message?: string } };
  if (!metaRes.ok || !meta.url) {
    throw new Error(meta.error?.message || "media_meta_failed");
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error(`media_download_failed_${fileRes.status}`);
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  return { bytes: buf, mimeType: meta.mime_type || "audio/ogg" };
}

export { normalizePhone, GRAPH };
