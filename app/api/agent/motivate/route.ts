import { NextRequest, NextResponse } from "next/server";
import { runMotivationMessage } from "@/lib/agent/run";
import { getAgentSettings, motivationKindForHour } from "@/lib/agent/settings";
import {
  recordMotivationDig,
  claimMotivationDig,
  releaseMotivationDig,
} from "@/lib/agent/whatsapp-dedup";
import { mapAgentErrorCode } from "@/lib/agent/whatsapp-outbound";
import { sendWhatsAppDig } from "@/lib/whatsapp/client";
import { isCronAuthorized } from "@/lib/api/cron-auth";
import { forEachAccount } from "@/lib/db/accounts";

export const maxDuration = 60;

function jerusalemHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === "hour")?.value ?? now.getUTCHours());
}

/** The current account's dig for this slot, if it has one due. */
async function motivateAccount(): Promise<Record<string, unknown>> {
  const settings = await getAgentSettings();
  if (!settings.enabled) {
    return { skipped: true, reason: "disabled" };
  }
  if (!settings.whatsapp_phone) {
    return { skipped: true, reason: "no_phone" };
  }

  const hour = jerusalemHour();
  const kind = motivationKindForHour(hour, settings.dig_hours);
  if (!kind) {
    return {
      skipped: true,
      reason: "off_slot",
      hour,
      dig_hours: settings.dig_hours,
    };
  }

  const digGate = await claimMotivationDig(kind);
  if (!digGate.ok) {
    return {
      skipped: true,
      reason: digGate.reason === "duplicate" ? "already_sent_today" : digGate.reason,
      kind,
      hour,
    };
  }

  try {
    const result = await runMotivationMessage(kind);
    if (!("text" in result)) {
      await releaseMotivationDig(kind, digGate.dayKey);
      return result as Record<string, unknown>;
    }

    if (!result.text.trim()) {
      await releaseMotivationDig(kind, digGate.dayKey);
      return { skipped: true, reason: "empty_dig", kind, hour };
    }

    const sent = await sendWhatsAppDig(settings.whatsapp_phone, result.text);
    if (!sent.ok) {
      await releaseMotivationDig(kind, digGate.dayKey);
      return { ok: false, error: sent.error, kind, hour, via: sent.via };
    }
    await recordMotivationDig(kind, digGate.dayKey, result.text);

    return {
      ok: true,
      kind,
      hour,
      dig_hours: settings.dig_hours,
      via: sent.via,
      messageId: sent.messageId,
      text: result.text,
    };
  } catch (err) {
    // Nothing went out, so the day's slot must not stay taken.
    await releaseMotivationDig(kind, digGate.dayKey);
    const code = mapAgentErrorCode(err);
    console.error("[agent-motivate]", code);
    if (code === "gemini_credits_depleted") {
      return { skipped: true, reason: code };
    }
    return { error: code };
  }
}

/**
 * Vercel cron: six daily entries at UTC 05,06,10,11,18,19 — covers default dig_hours [8,13,21]
 * Jerusalem across IST/IDT. Dig only when Jerusalem hour ∈ dig_hours.
 * (Hobby plan rejects comma-hour expressions; use separate entries in vercel.json.)
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accounts = await forEachAccount(motivateAccount);
  for (const run of accounts) {
    if (!run.ok) console.error("[agent-motivate]", run.email, run.error);
  }
  const ok = accounts.every((run) => run.ok && run.result.ok !== false && !run.result.error);
  return NextResponse.json({ ok, accounts }, { status: ok ? 200 : 500 });
}
