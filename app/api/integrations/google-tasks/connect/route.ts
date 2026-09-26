import { NextRequest, NextResponse } from "next/server";
import { googleConnectUrl } from "@/lib/integrations/google-connect-url";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/** Unified Google OAuth (calendar + tasks + Gmail). */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const appRedirect = sp.get("app_redirect");
  const next = sp.get("next");
  const url = googleConnectUrl(req.nextUrl.origin, {
    appRedirect: appRedirect ?? undefined,
    next: next ?? "/settings",
  });
  return NextResponse.redirect(url);
});
