import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { setOAuthState } from "@/lib/integrations/oauth-state";
import { isAllowedAppRedirect } from "@/lib/integrations/mobile-redirect";
import { gmailAuthUrl } from "@/lib/integrations/gmail/client";

const APP_REDIRECT_COOKIE = "gmail_oauth_app_redirect";

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(req: NextRequest) {
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

  return NextResponse.redirect(gmailAuthUrl(state));
}
