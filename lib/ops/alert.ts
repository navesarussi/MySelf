import { getAgentSettings } from "@/lib/agent/settings";
import { runAsPrimary } from "@/lib/db/accounts";
import { notifyUser } from "@/lib/push/notify";
import { isWhatsAppConfigured, sendWhatsAppText } from "@/lib/whatsapp/client";

export type OpsAlert = { title: string; body: string; ref: string };

export type OpsAlertResult = {
  push: { sent: number } | { skipped: string };
  whatsapp?: { ok: boolean; error?: string };
};

/**
 * Tell the owner something in production is broken: push first, WhatsApp when
 * no device received it. Goes to the primary account — the operator.
 *
 * `ref` dedupes per Jerusalem day (notification_log), so a retried workflow or
 * a second cron run does not push twice. Quiet hours are bypassed: an outage
 * is the one thing worth waking a phone for.
 */
export async function sendOpsAlert(alert: OpsAlert): Promise<OpsAlertResult | null> {
  return runAsPrimary(async () => {
    const pushed = await notifyUser(
      "ops",
      { title: alert.title, body: alert.body, data: { type: "ops" } },
      alert.ref,
      { bypassQuiet: true }
    );
    const push = pushed.ok ? { sent: pushed.result.sent } : { skipped: pushed.reason };
    // A duplicate means this alert already went out today — do not fall back.
    const delivered = pushed.ok ? pushed.result.sent > 0 : pushed.reason === "duplicate";
    if (delivered) return { push };

    const phone = (await getAgentSettings()).whatsapp_phone;
    if (!phone || !isWhatsAppConfigured()) return { push, whatsapp: { ok: false, error: "no_whatsapp" } };
    const sent = await sendWhatsAppText(phone, `${alert.title}\n${alert.body}`);
    return { push, whatsapp: sent.ok ? { ok: true } : { ok: false, error: sent.error } };
  });
}
