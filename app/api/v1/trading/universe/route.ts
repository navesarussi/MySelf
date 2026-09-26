import { NextRequest, NextResponse } from "next/server";
import { dbError, denyUnlessPrimary } from "@/lib/api/auth";
import { getUniverseView } from "@/lib/trading/service";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getUniverseView());
  } catch {
    return dbError();
  }
});
