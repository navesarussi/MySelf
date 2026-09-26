import { NextRequest, NextResponse } from "next/server";
import { dbError, denyUnlessPrimary } from "@/lib/api/auth";
import { getCommitteeDualTrackSummary } from "@/lib/trading/committee/store";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/** Read-only dual-track committee shadow metrics (baseline vs committee). */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const days = Number(req.nextUrl.searchParams.get("days") ?? 7);
  const sinceIso = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;
  try {
    return NextResponse.json(await getCommitteeDualTrackSummary({ sinceIso, limit: 500 }));
  } catch {
    return dbError();
  }
});
