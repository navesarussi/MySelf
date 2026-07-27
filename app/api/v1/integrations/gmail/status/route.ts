import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized, unauthorized, dbError } from "@/lib/api/auth";
import { GOOGLE_GMAIL_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken } from "@/lib/integrations/tokens";

export async function GET(req: NextRequest) {
  if (!(await isApiAuthorized(req))) return unauthorized();

  try {
    const token = await getIntegrationToken(GOOGLE_GMAIL_PROVIDER);
    return NextResponse.json({
      connected: token !== null,
      connectedAt: token?.connected_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch_failed";
    console.error("[gmail-status]", message);
    return dbError(message);
  }
}
