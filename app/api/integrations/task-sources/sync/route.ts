import { NextRequest, NextResponse } from "next/server";
import { syncTaskSource } from "@/lib/integrations/task-sources/orchestrator";
import { getIntegrationToken, listIntegrationTokens } from "@/lib/integrations/tokens";
import { MONDAY_PROVIDER } from "@/lib/integrations/monday-config";
import type { TaskSourceId } from "@/lib/integrations/task-sources/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function isCronRequest(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

function syncedWithinDay(lastSyncAt: string | null | undefined): boolean {
  if (!lastSyncAt) return false;
  return Date.now() - new Date(lastSyncAt).getTime() < DAY_MS;
}

async function shouldSkipDailySync(provider: TaskSourceId): Promise<{ skip: boolean; reason?: string }> {
  if (provider === MONDAY_PROVIDER) {
    const accounts = await listIntegrationTokens(MONDAY_PROVIDER);
    if (!accounts.length) return { skip: true, reason: "not_connected" };
    if (accounts.some((a) => a.sync_status === "running")) {
      return { skip: true, reason: "already_running" };
    }
    if (accounts.every((a) => syncedWithinDay(a.last_sync_at))) {
      return { skip: true, reason: "synced_today" };
    }
    return { skip: false };
  }

  const token = await getIntegrationToken(provider);
  if (!token) return { skip: true, reason: "not_connected" };

  if (syncedWithinDay(token.last_sync_at)) {
    return { skip: true, reason: "synced_today" };
  }

  if (token.sync_status === "running") {
    return { skip: true, reason: "already_running" };
  }

  return { skip: false };
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const providers: TaskSourceId[] = ["google_tasks", "monday", "github"];
    const skipped: Record<string, string> = {};
    const results: Record<
      string,
      { imported: number; markedDone: number; error?: string; alreadyRunning?: true }
    > = {};

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

    return NextResponse.json({
      ok: true,
      results,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    console.error("[task-sources-sync-cron]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
