import { NextRequest, NextResponse } from "next/server";
import { dbError, isApiAuthorized, unauthorized } from "@/lib/api/auth";
import { getFinanceSourcesStatus } from "@/lib/finance/sources-status";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const status = await getFinanceSourcesStatus();
    return NextResponse.json(status);
  } catch (err) {
    return dbError(err instanceof Error ? err.message : "sources_status_failed");
  }
});
