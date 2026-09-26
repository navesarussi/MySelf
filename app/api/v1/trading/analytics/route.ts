import { NextRequest, NextResponse } from "next/server";
import { dbError, denyUnlessPrimary } from "@/lib/api/auth";
import { getAnalytics } from "@/lib/trading/service";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const p = req.nextUrl.searchParams;
  const days = Number(p.get("days") ?? 0);
  try {
    return NextResponse.json(
      await getAnalytics({
        execution: p.get("execution") || undefined,
        track: p.get("track") || undefined,
        sinceIso: days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined,
      })
    );
  } catch {
    return dbError();
  }
});
