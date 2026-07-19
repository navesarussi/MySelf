import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { setOAuthState } from "@/lib/integrations/oauth-state";
import { isAllowedAppRedirect } from "@/lib/integrations/mobile-redirect";
import { mondayAuthUrl } from "@/lib/integrations/task-sources/monday/client";
import { mondayConfigured } from "@/lib/integrations/monday-config";

const APP_REDIRECT_COOKIE = "monday_oauth_app_redirect";

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(req: NextRequest) {
  if (!mondayConfigured()) {
    return NextResponse.json({ error: "monday_not_configured" }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const next = sp.get("next");
  const appRedirect = sp.get("app_redirect");

  const state = randomBytes(16).toString("hex");
  const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  await setOAuthState(state, nextPath);

  if (appRedirect && isAllowedAppRedirect(appRedirect)) {
    const jar = await cookies();
    jar.set(APP_REDIRECT_COOKIE, appRedirect, cookieOpts);
  }

  return NextResponse.redirect(mondayAuthUrl(state));
}
