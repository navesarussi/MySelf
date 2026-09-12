import { NextRequest, NextResponse } from "next/server";
import { googleConnectUrl } from "@/lib/integrations/google-connect-url";

/** Unified Google OAuth (calendar + tasks + Gmail). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const appRedirect = sp.get("app_redirect");
  const next = sp.get("next");
  const url = googleConnectUrl(req.nextUrl.origin, {
    appRedirect: appRedirect ?? undefined,
    next: next ?? "/settings",
  });
  return NextResponse.redirect(url);
}
