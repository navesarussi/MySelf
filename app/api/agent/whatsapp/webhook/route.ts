import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings, isAuthorizedWhatsAppSender } from "@/lib/agent/settings";
import { handleCodingTaskRequest } from "@/lib/agent/coding/bridge";
import { runAgentChat } from "@/lib/agent/run";
import {
  claimWhatsAppInbound,
  finalizeWhatsAppInbound,
} from "@/lib/agent/whatsapp-dedup";
import {
  downloadWhatsAppMedia,
  parseInboundWhatsAppMessage,
  sendWhatsAppText,
  verifyWhatsAppWebhook,
} from "@/lib/whatsapp/client";
import { transcribeWhatsAppAudio } from "@/lib/whatsapp/transcribe";

export const maxDuration = 60;

/** Meta expects 200 quickly; never return 5xx (retries cause duplicate replies). */
function webhookOk(body: Record<string, unknown> = { ok: true }) {
  return NextResponse.json(body);
}

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
    return webhookOk();
  }

  const inbound = parseInboundWhatsAppMessage(body);
  if (!inbound) {
    console.log("[whatsapp-webhook] ignored_unsupported_or_empty");
    return webhookOk();
  }

  const settings = await getAgentSettings();
  if (!settings.enabled) return webhookOk({ ok: true, skipped: "disabled" });
  if (!isAuthorizedWhatsAppSender(inbound.from, settings)) {
    console.log("[whatsapp-webhook] unauthorized_sender", inbound.from);
    return webhookOk({ ok: true, skipped: "unauthorized_sender" });
  }

  const claim = await claimWhatsAppInbound(inbound.messageId);
  if (claim === "duplicate") {
    console.log("[whatsapp-webhook] duplicate", inbound.messageId);
    return webhookOk({ ok: true, skipped: "duplicate" });
  }
  if (claim === "error") {
    console.error("[whatsapp-webhook] claim_error", inbound.messageId);
    return webhookOk({ ok: true, skipped: "claim_error" });
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
        await finalizeWhatsAppInbound(inbound.messageId, `[voice transcribe_failed]`);
        return webhookOk({ ok: true, skipped: "transcribe_failed" });
      }
    }

    if (!userText.trim()) {
      await finalizeWhatsAppInbound(inbound.messageId, "[empty]");
      return webhookOk({ ok: true, skipped: "empty_text" });
    }

    const logContent =
      inbound.kind === "audio" ? `[voice] ${userText}` : userText;

    await finalizeWhatsAppInbound(inbound.messageId, logContent);

    const coding = await handleCodingTaskRequest({
      message: userText,
      channel: "whatsapp",
      logInbound: false,
      external_id: inbound.messageId,
      inboundLogContent: logContent,
    });
    if (coding.handled) {
      const sent = await sendWhatsAppText(inbound.from, coding.text);
      if (!sent.ok) console.error("[whatsapp-webhook] send_failed", sent.error);
      return webhookOk({
        ok: sent.ok,
        messageId: sent.ok ? sent.messageId : undefined,
        via: inbound.kind,
        coding: true,
        ...(sent.ok ? {} : { send_error: sent.error }),
      });
    }

    const { text } = await runAgentChat({
      message: userText,
      channel: "whatsapp",
      logInbound: false,
    });

    if (!text.trim()) {
      console.warn("[whatsapp-webhook] empty_agent_reply", inbound.messageId);
      return webhookOk({ ok: true, skipped: "empty_reply" });
    }

    const sent = await sendWhatsAppText(inbound.from, text);
    if (!sent.ok) console.error("[whatsapp-webhook] send_failed", sent.error);
    return webhookOk({
      ok: sent.ok,
      messageId: sent.ok ? sent.messageId : undefined,
      via: inbound.kind,
      ...(sent.ok ? {} : { send_error: sent.error }),
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "agent_error";
    console.error("[whatsapp-webhook]", code);
    return webhookOk({ ok: true, skipped: "error", error: code });
  }
}
