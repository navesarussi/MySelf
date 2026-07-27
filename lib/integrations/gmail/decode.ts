import type { GmailHeader, GmailMessage, GmailMessagePart } from "./types";

export function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

export function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const found = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() ?? "";
}

function collectBodies(part: GmailMessagePart | undefined, out: { text: string[]; html: string[] }) {
  if (!part) return;
  const mime = part.mimeType?.toLowerCase() ?? "";
  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (mime === "text/plain") out.text.push(decoded);
    else if (mime === "text/html") out.html.push(decoded);
  }
  for (const child of part.parts ?? []) collectBodies(child, out);
}

export function extractEmailBody(payload: GmailMessagePart | undefined): string {
  const out = { text: [] as string[], html: [] as string[] };
  collectBodies(payload, out);
  if (out.text.length) return out.text.join("\n\n").trim();
  if (out.html.length) return stripHtml(out.html.join("\n\n")).trim();
  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactEmailFromMessage(msg: GmailMessage) {
  const headers = msg.payload?.headers;
  const internalMs = msg.internalDate ? Number(msg.internalDate) : NaN;
  const date = Number.isFinite(internalMs)
    ? new Date(internalMs).toISOString()
    : headerValue(headers, "Date");

  return {
    id: msg.id,
    thread_id: msg.threadId,
    from: headerValue(headers, "From"),
    subject: headerValue(headers, "Subject") || "(ללא נושא)",
    date,
    snippet: msg.snippet ?? "",
  };
}
