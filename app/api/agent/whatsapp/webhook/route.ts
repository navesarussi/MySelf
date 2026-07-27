import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings, isAuthorizedWhatsAppSender } from "@/lib/agent/settings";
import { runAgentChat } from "@/lib/agent/run";
import { logAgentMessage } from "@/lib/agent/log";
import {
  downloadWhatsAppMedia,
  parseInboundWhatsAppMessage,
  sendWhatsAppText,
  verifyWhatsAppWebhook,
} from "@/lib/whatsapp/client";
import { transcribeWhatsAppAudio } from "@/lib/whatsapp/transcribe";

export const maxDuration = 60;

/** Meta webhook verification (GET). */
export async function GET(req: NextRequest) {
  const challenge = verifyWhatsAppWebhook(req.nextUrl.searchParams);
  if (!challenge) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

/** Inbound WhatsApp messages (POST) — text + voice notes. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const inbound = parseInboundWhatsAppMessage(body);
  if (!inbound) {
    console.log("[whatsapp-webhook] ignored_unsupported_or_empty");
    return NextResponse.json({ ok: true });
  }

  const settings = await getAgentSettings();
  if (!settings.enabled) return NextResponse.json({ ok: true, skipped: "disabled" });
  if (!isAuthorizedWhatsAppSender(inbound.from, settings)) {
    console.log("[whatsapp-webhook] unauthorized_sender", inbound.from);
    return NextResponse.json({ ok: true, skipped: "unauthorized_sender" });
  }

  try {
    let userText = inbound.text || "";

    if (inbound.kind === "audio" && inbound.audioMediaId) {
      try {
        const media = await downloadWhatsAppMedia(inbound.audioMediaId);
        userText = await transcribeWhatsAppAudio({
          bytes: media.bytes,
          mimeType: inbound.audioMimeType || media.mimeType,
        });
      } catch (err) {
        const code = err instanceof Error ? err.message : "transcribe_failed";
        console.error("[whatsapp-webhook] audio", code);
        await sendWhatsAppText(
          inbound.from,
          "קיבלתי את ההקלטה אבל לא הצלחתי לתמלל. תשלח שוב בקול ברור יותר, או כתוב בטקסט."
        );
        return NextResponse.json({ ok: true, skipped: "transcribe_failed" });
      }
    }

    if (!userText.trim()) {
      return NextResponse.json({ ok: true, skipped: "empty_text" });
    }

    const logContent =
      inbound.kind === "audio" ? `[voice] ${userText}` : userText;

    await logAgentMessage({
      direction: "inbound",
      channel: "whatsapp",
      content: logContent,
      external_id: inbound.messageId,
    });

    const { text } = await runAgentChat({
      message: userText,
      channel: "whatsapp",
      logInbound: false,
    });

    const sent = await sendWhatsAppText(inbound.from, text);
    if (!sent.ok) {
      console.error("[whatsapp-webhook] send_failed", sent.error);
      return NextResponse.json({ ok: false, error: sent.error }, { status: sent.configured ? 502 : 503 });
    }

    return NextResponse.json({
      ok: true,
      messageId: sent.messageId,
      via: inbound.kind,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "agent_error";
    console.error("[whatsapp-webhook]", code);
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
