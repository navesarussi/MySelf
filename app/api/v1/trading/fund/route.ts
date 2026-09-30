import { NextRequest, NextResponse } from "next/server";
import { denyUnlessPrimary } from "@/lib/api/auth";
import { getFundView } from "@/lib/trading/service-fund";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getFundView(), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fund_failed" }, { status: 500 });
  }
});
