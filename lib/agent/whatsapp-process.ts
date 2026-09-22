import type { InboundWhatsAppMessage } from "@/lib/whatsapp/inbound";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/client";
import { transcribeWhatsAppAudio } from "@/lib/whatsapp/transcribe";
import { handleCodingTaskRequest } from "@/lib/agent/coding/bridge";
import { runAgentChat } from "@/lib/agent/run";
import { sanitizeAgentReply } from "@/lib/agent/reply";
import { finalizeWhatsAppInbound } from "@/lib/agent/whatsapp-dedup";
import { sendWhatsAppReplyOnce, userFacingAgentError } from "@/lib/agent/whatsapp-outbound";

export function buildInboundLogContent(kind: "text" | "audio", text: string): string {
  return kind === "audio" ? `[voice] ${text}` : text;
}

export async function processWhatsAppInbound(inbound: InboundWhatsAppMessage): Promise<void> {
  let userText = inbound.text ?? "";

  if (inbound.kind === "audio" && inbound.audioMediaId) {
    try {
      const media = await downloadWhatsAppMedia(inbound.audioMediaId);
      userText = await transcribeWhatsAppAudio({
        bytes: media.bytes,
        mimeType: inbound.audioMimeType || media.mimeType,
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "transcribe_failed";
      console.error("[whatsapp-process] audio", code);
      await sendWhatsAppReplyOnce(
        inbound.from,
        inbound.messageId,
        "קיבלתי הקלטה אבל התמלול נכשל. דבר לאט ליד המיקרופון או כתוב בטקסט."
      );
      await finalizeWhatsAppInbound(inbound.messageId, `[voice transcribe_failed]`);
      return;
    }
  }

  const logContent = buildInboundLogContent(inbound.kind, userText);
  await finalizeWhatsAppInbound(inbound.messageId, logContent || "[empty]");

  if (!userText.trim()) {
    await sendWhatsAppReplyOnce(
      inbound.from,
      inbound.messageId,
      "לא שמעתי טקסט בהקלטה. תדבר שוב לאט או תכתוב."
    );
    return;
  }

  const coding = await handleCodingTaskRequest({
    message: userText,
    channel: "whatsapp",
    logInbound: false,
    external_id: inbound.messageId,
    inboundLogContent: logContent,
  });

  let replyText = coding.handled
    ? coding.text
    : sanitizeAgentReply(
        (await runAgentChat({ message: userText, channel: "whatsapp", logInbound: false })).text
      );

  const body = replyText.trim() || userFacingAgentError("agent_error");
  const sent = await sendWhatsAppReplyOnce(inbound.from, inbound.messageId, body);
  if (!sent.ok && sent.skipped !== "duplicate_outbound") {
    console.error("[whatsapp-process] send_failed", inbound.messageId, sent.skipped);
  }
}
