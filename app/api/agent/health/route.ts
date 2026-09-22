import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings } from "@/lib/agent/settings";
import { isWhatsAppConfigured, sendWhatsAppText } from "@/lib/whatsapp/client";

function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

/** Daily probe: Gemini key + WhatsApp send path. */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getAgentSettings();
  const issues: string[] = [];

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) issues.push("missing_gemini_api_key");
  if (!isWhatsAppConfigured()) issues.push("whatsapp_not_configured");

  if (settings.whatsapp_phone && isWhatsAppConfigured()) {
    const probe = await sendWhatsAppText(
      settings.whatsapp_phone,
      "[health] בדיקת חיבור אוטומטית — אפשר להתעלם."
    );
    if (!probe.ok) issues.push(`whatsapp_send_failed:${probe.error}`);
  }

  return NextResponse.json({ ok: issues.length === 0, issues });
}
