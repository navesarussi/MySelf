import { NextRequest, NextResponse } from "next/server";
import { runMotivationMessage } from "@/lib/agent/run";
import { getAgentSettings, motivationKindForHour } from "@/lib/agent/settings";
import {
  recordMotivationDig,
  shouldSendMotivationDig,
} from "@/lib/agent/whatsapp-dedup";
import { mapAgentErrorCode } from "@/lib/agent/whatsapp-outbound";
import { sendWhatsAppDig } from "@/lib/whatsapp/client";

export const maxDuration = 60;

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

function jerusalemHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? now.getUTCHours());
}

/**
 * Vercel cron: `2 5,6,10,11,18,19 * * *` (6×/day) — covers default dig_hours [8,13,21]
 * Jerusalem across IST/IDT. Dig only when Jerusalem hour ∈ dig_hours.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getAgentSettings();
  if (!settings.enabled) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }
  if (!settings.whatsapp_phone) {
    return NextResponse.json({ skipped: true, reason: "no_phone" });
  }

  const hour = jerusalemHour();
  const kind = motivationKindForHour(hour, settings.dig_hours);
  if (!kind) {
    return NextResponse.json({
      skipped: true,
      reason: "off_slot",
      hour,
      dig_hours: settings.dig_hours,
    });
  }

  const digGate = await shouldSendMotivationDig(kind);
  if (!digGate.ok) {
    return NextResponse.json({
      skipped: true,
      reason: digGate.reason === "duplicate" ? "already_sent_today" : digGate.reason,
      kind,
      hour,
    });
  }

  try {
    const result = await runMotivationMessage(kind);
    if (!("text" in result)) {
      return NextResponse.json(result);
    }

    if (!result.text.trim()) {
      return NextResponse.json({ skipped: true, reason: "empty_dig", kind, hour });
    }

    const sent = await sendWhatsAppDig(settings.whatsapp_phone, result.text);
    if (!sent.ok) {
      return NextResponse.json(
        { ok: false, error: sent.error, kind, hour, via: sent.via },
        { status: 502 }
      );
    }
    await recordMotivationDig(kind, digGate.dayKey, result.text);

    return NextResponse.json({
      ok: true,
      kind,
      hour,
      dig_hours: settings.dig_hours,
      via: sent.via,
      messageId: sent.messageId,
      text: result.text,
    });
  } catch (err) {
    const code = mapAgentErrorCode(err);
    console.error("[agent-motivate]", code);
    if (code === "gemini_credits_depleted") {
      return NextResponse.json({ skipped: true, reason: code });
    }
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
