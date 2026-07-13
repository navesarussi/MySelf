import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken } from "@/lib/integrations/tokens";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";

/** Same payload as /api/integrations/google/sync/status, but Bearer-friendly. */
export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) {
    return NextResponse.json({ connected: false });
  }

  const { count } = await getSupabase()
    .from("timeline_events")
    .select("id", { count: "exact", head: true })
    .eq("source", "google_calendar");

  return NextResponse.json({
    connected: true,
    syncStatus: token.sync_status ?? "idle",
    syncProgress: token.sync_progress ?? null,
    lastSyncAt: token.last_sync_at,
    eventCount: count ?? 0,
  });
}
