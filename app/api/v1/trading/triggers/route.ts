import { NextRequest, NextResponse } from "next/server";
import { dbError, denyUnlessPrimary } from "@/lib/api/auth";
import { getTriggers } from "@/lib/trading/service";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  const p = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await getTriggers({ symbol: p.get("symbol") || undefined, limit: Math.min(Number(p.get("limit") ?? 50), 200) }));
  } catch {
    return dbError();
  }
});
