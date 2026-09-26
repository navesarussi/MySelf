import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { userDb } from "@/lib/db/user-db";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken } from "@/lib/integrations/tokens";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();
  const token = await getIntegrationToken(GOOGLE_PROVIDER);
  if (!token) {
    return NextResponse.json({ connected: false }, { status: 404 });
  }


  const db = await userDb();
  const { count } = await db
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
});
