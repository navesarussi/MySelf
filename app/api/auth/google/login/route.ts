import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { googleAuthUrl } from "@/lib/integrations/google-calendar/client";
import { googleAuthConfigured } from "@/lib/integrations/google-config";
import { setOAuthState } from "@/lib/integrations/oauth-state";
import { isAllowedAppRedirect } from "@/lib/integrations/mobile-redirect";

const APP_REDIRECT_COOKIE = "google_oauth_app_redirect";

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function GET(req: NextRequest) {
  if (!googleAuthConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const next = sp.get("next") ?? "/";
  const appRedirect = sp.get("app_redirect");

  const state = crypto.randomUUID();
  const nextPath = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  await setOAuthState("google", state, nextPath);

  if (appRedirect && isAllowedAppRedirect(appRedirect)) {
    const jar = await cookies();
    jar.set(APP_REDIRECT_COOKIE, appRedirect, cookieOpts);
  }

  return NextResponse.redirect(googleAuthUrl(state, "login"));
}
