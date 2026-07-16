import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { GOOGLE_TASKS_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, getTokenSettings } from "@/lib/integrations/tokens";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const token = await getIntegrationToken(GOOGLE_TASKS_PROVIDER);
    const connected = token !== null;

    if (!connected) {
      return NextResponse.json({
        connected: false,
        syncStatus: "idle" as const,
        lastSyncAt: null,
        taskCount: 0,
        selected_list_ids: [],
      });
    }

    const settings = await getTokenSettings<{ selected_list_ids?: string[] }>(GOOGLE_TASKS_PROVIDER);
    const { count } = await getSupabase()
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("source", "google_tasks");

    return NextResponse.json({
      connected: true,
      syncStatus: token.sync_status ?? "idle",
      lastSyncAt: token.last_sync_at ?? null,
      taskCount: count ?? 0,
      selected_list_ids: settings.selected_list_ids ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[google-tasks-status]", message);
    return dbError(message);
  }
}
