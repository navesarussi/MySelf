import { NextRequest, NextResponse } from "next/server";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, tryStartSync } from "@/lib/integrations/tokens";

const DAY_MS = 24 * 60 * 60 * 1000;

function isCronRequest(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

async function shouldSkipDailySync() {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) return { skip: true, reason: "not_connected" as const };

  if (token.last_sync_at) {
    const lastSync = new Date(token.last_sync_at).getTime();
    if (Date.now() - lastSync < DAY_MS) {
      return { skip: true, reason: "synced_today" as const };
    }
  }

  if (token.sync_status === "running") {
    return { skip: true, reason: "already_running" as const };
  }

  return { skip: false as const, token };
}

/** Manual sync — runs to completion and returns result */
export async function POST() {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) {
    return NextResponse.json({ ok: false, error: "not_connected" }, { status: 400 });
  }

  const started = await tryStartSync(GOOGLE_PROVIDER);
  if (!started) {
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }

  try {
    const { imported, removed } = await syncGoogleCalendar();
    return NextResponse.json({ ok: true, imported, removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    console.error("[google-sync]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Vercel cron — sync inline, skip if already synced today */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const check = await shouldSkipDailySync();
  if (check.skip) {
    return NextResponse.json({ ok: true, skipped: true, reason: check.reason });
  }

  const started = await tryStartSync(GOOGLE_PROVIDER);
  if (!started) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_running" });
  }

  try {
    const { imported, removed } = await syncGoogleCalendar();
    return NextResponse.json({ ok: true, imported, removed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    console.error("[google-sync-cron]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
