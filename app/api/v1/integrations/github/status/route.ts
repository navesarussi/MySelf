import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { GITHUB_PROVIDER } from "@/lib/integrations/github-config";
import { getIntegrationToken, getTokenSettings } from "@/lib/integrations/tokens";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const token = await getIntegrationToken(GITHUB_PROVIDER);
    const connected = token !== null;

    if (!connected) {
      return NextResponse.json({
        connected: false,
        syncStatus: "idle" as const,
        lastSyncAt: null,
        taskCount: 0,
        task_count_by_repo: {},
        selected_list_ids: [],
        account_name: null,
      });
    }

    const settings = await getTokenSettings<{
      selected_list_ids?: string[];
      account_name?: string;
      account_login?: string;
    }>(GITHUB_PROVIDER);

    const { data: rows } = await getSupabase()
      .from("tasks")
      .select("external_list_id")
      .eq("source", "github")
      .neq("status", "done");

    const task_count_by_repo: Record<string, number> = {};
    for (const row of rows ?? []) {
      const key = row.external_list_id;
      if (!key) continue;
      task_count_by_repo[key] = (task_count_by_repo[key] ?? 0) + 1;
    }

    return NextResponse.json({
      connected: true,
      syncStatus: token.sync_status ?? "idle",
      lastSyncAt: token.last_sync_at ?? null,
      taskCount: Object.values(task_count_by_repo).reduce((a, b) => a + b, 0),
      task_count_by_repo,
      selected_list_ids: settings.selected_list_ids ?? [],
      account_name: settings.account_name ?? settings.account_login ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[github-status]", message);
    return dbError(message);
  }
}
