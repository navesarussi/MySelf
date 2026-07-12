import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken } from "@/lib/integrations/tokens";

export async function GET() {
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) {
    return NextResponse.json({ connected: false }, { status: 404 });
  }

  const supabase = getSupabase();
  const { count } = await supabase
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
