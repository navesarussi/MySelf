import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { getGmailConnectionStatus } from "@/lib/integrations/gmail/status";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const status = await getGmailConnectionStatus();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[gmail-status]", message);
    return dbError(message);
  }
});
