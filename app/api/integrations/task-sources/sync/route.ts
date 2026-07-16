import { NextRequest, NextResponse } from "next/server";
import { syncAllTaskSources } from "@/lib/integrations/task-sources/orchestrator";
import { getIntegrationToken } from "@/lib/integrations/tokens";
import type { TaskSourceId } from "@/lib/integrations/task-sources/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function isCronRequest(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

async function shouldSkipDailySync(provider: TaskSourceId): Promise<{ skip: boolean; reason?: string }> {
  const token = await getIntegrationToken(provider);
  if (!token) return { skip: true, reason: "not_connected" };

  if (token.last_sync_at) {
    const lastSync = new Date(token.last_sync_at).getTime();
    if (Date.now() - lastSync < DAY_MS) {
      return { skip: true, reason: "synced_today" };
    }
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
    
    for (const provider of providers) {
      const check = await shouldSkipDailySync(provider);
      if (check.skip && check.reason) {
        skipped[provider] = check.reason;
      }
    }

    const results = await syncAllTaskSources();
    
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
