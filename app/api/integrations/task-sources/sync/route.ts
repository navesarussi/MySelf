import { NextRequest, NextResponse } from "next/server";
import { syncTaskSource } from "@/lib/integrations/task-sources/orchestrator";
import { getIntegrationToken, listIntegrationTokens } from "@/lib/integrations/tokens";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import type { TaskSourceId } from "@/lib/integrations/task-sources/types";
import { isCronAuthorized as isCronRequest } from "@/lib/api/cron-auth";
import { forEachAccount } from "@/lib/db/accounts";
import { syncedToday } from "@/lib/integrations/daily-sync";

/** Daily cron syncs run inline; the platform default is far too short for them. */
export const maxDuration = 60;

async function shouldSkipDailySync(provider: TaskSourceId): Promise<{ skip: boolean; reason?: string }> {
  if (provider === MONDAY_PROVIDER) {
    const accounts = await listIntegrationTokens(MONDAY_PROVIDER);
    if (!accounts.length) return { skip: true, reason: "not_connected" };
    if (accounts.some((a) => a.sync_status === "running")) {
      return { skip: true, reason: "already_running" };
    }
    if (accounts.every((a) => syncedToday(a.last_sync_at))) {
      return { skip: true, reason: "synced_today" };
    }
    return { skip: false };
  }

  const token = await getIntegrationToken(provider);
  if (!token) return { skip: true, reason: "not_connected" };

  if (syncedToday(token.last_sync_at)) {
    return { skip: true, reason: "synced_today" };
  }

  if (token.sync_status === "running") {
    return { skip: true, reason: "already_running" };
  }

  return { skip: false };
}

type SourceResult = { imported: number; markedDone: number; error?: string; alreadyRunning?: true };

/** The current account's due task sources. */
async function syncAccountSources() {
  const providers: TaskSourceId[] = ["google_tasks", "monday", "github"];
  const skipped: Record<string, string> = {};
  const results: Record<string, SourceResult> = {};

  for (const provider of providers) {
    const check = await shouldSkipDailySync(provider);
    if (check.skip && check.reason) {
      skipped[provider] = check.reason;
      continue;
    }

    try {
      results[provider] = await syncTaskSource(provider);
    } catch (err) {
      results[provider] = {
        imported: 0,
        markedDone: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { results, skipped };
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const accounts = await forEachAccount(syncAccountSources);
  for (const run of accounts) {
    if (!run.ok) console.error("[task-sources-sync-cron]", run.email, run.error);
  }
  const ok = accounts.every((run) => run.ok);
  return NextResponse.json({ ok, accounts }, { status: ok ? 200 : 500 });
}
