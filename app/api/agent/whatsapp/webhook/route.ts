import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { accountForWhatsAppSender } from "@/lib/agent/account-by-phone";
import { runAsUser } from "@/lib/db/user-context";
import { processWhatsAppInbound } from "@/lib/agent/whatsapp-process";
import { claimWhatsAppInbound } from "@/lib/agent/whatsapp-dedup";
import {
  mapAgentErrorCode,
  sendWhatsAppReplyOnce,
  userFacingAgentError,
} from "@/lib/agent/whatsapp-outbound";
import { parseInboundWhatsAppMessage, verifyWhatsAppWebhook } from "@/lib/whatsapp/client";

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

  // The sender's number, registered in an account's enabled agent settings, is
  // the only identity a webhook call has.
  const account = await accountForWhatsAppSender(inbound.from);
  if (!account) {
    console.log("[whatsapp-webhook] unauthorized_sender", inbound.from);
    return webhookOk({ ok: true, skipped: "unauthorized_sender" });
  }

  return runAsUser(account, async () => {
    const claim = await claimWhatsAppInbound(inbound.messageId);
    if (claim === "duplicate") {
      console.log("[whatsapp-webhook] duplicate", inbound.messageId);
      return webhookOk({ ok: true, skipped: "duplicate" });
    }
    if (claim === "error") {
      console.error("[whatsapp-webhook] claim_error", inbound.messageId);
      return webhookOk({ ok: true, skipped: "claim_error" });
    }

    after(() => runAsUser(account, async () => {
      try {
        await processWhatsAppInbound(inbound);
      } catch (err) {
        const code = mapAgentErrorCode(err);
        console.error("[whatsapp-webhook-after]", code, inbound.messageId);
        await sendWhatsAppReplyOnce(
          inbound.from,
          inbound.messageId,
          userFacingAgentError(code)
        );
      }
    }));

    return webhookOk({ ok: true, queued: true, messageId: inbound.messageId });
  });
}
