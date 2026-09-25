import { NextRequest, NextResponse } from "next/server";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, tryStartSync } from "@/lib/integrations/tokens";
import { isCronAuthorized as isCronRequest } from "@/lib/api/cron-auth";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { forEachAccount } from "@/lib/db/accounts";

/** Daily cron syncs run inline; the platform default is far too short for them. */
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

type SyncResult = { status: number; body: Record<string, unknown> };

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

/** Sync the current account's calendar to completion. */
async function syncNow(logTag: string): Promise<SyncResult> {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) return { status: 400, body: { ok: false, error: "not_connected" } };

  if (!(await tryStartSync(GOOGLE_PROVIDER))) {
    return { status: 200, body: { ok: true, alreadyRunning: true } };
  }

  try {
    const { imported, removed } = await syncGoogleCalendar();
    return { status: 200, body: { ok: true, imported, removed } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    console.error(logTag, message);
    return { status: 500, body: { ok: false, error: message } };
  }
}

async function dailySync(): Promise<SyncResult> {
  const check = await shouldSkipDailySync();
  if (check.skip) return { status: 200, body: { ok: true, skipped: true, reason: check.reason } };
  return syncNow("[google-sync-cron]");
}

/** Every account, for the scheduler. */
async function allAccounts(run: () => Promise<SyncResult>) {
  const accounts = await forEachAccount(async () => (await run()).body);
  return NextResponse.json({ ok: accounts.every((a) => a.ok && a.result.ok !== false), accounts });
}

/** Manual sync — runs to completion and returns result. Scheduler: every account. */
export async function POST(req: NextRequest) {
  if (isCronRequest(req)) return allAccounts(() => syncNow("[google-sync]"));
  if (!(await isApiAuthorized(req))) return unauthorized();
  const { status, body } = await syncNow("[google-sync]");
  return NextResponse.json(body, { status });
}

/** Vercel cron — sync inline, skip accounts already synced today */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return allAccounts(dailySync);
}
