import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGmailCode } from "@/lib/integrations/gmail/client";
import { GOOGLE_GMAIL_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import {
  appendTokenToRedirect,
  isAllowedAppRedirect,
} from "@/lib/integrations/mobile-redirect";
import { setFlashCookie } from "@/lib/flash";

const APP_REDIRECT_COOKIE = "gmail_oauth_app_redirect";

function redirectToAppOrNext(
  jar: Awaited<ReturnType<typeof cookies>>,
  url: NextRequest["nextUrl"],
  next: string
) {
  const appRedirect = jar.get(APP_REDIRECT_COOKIE)?.value;
  jar.delete(APP_REDIRECT_COOKIE);
  if (appRedirect && isAllowedAppRedirect(appRedirect)) {
    const sessionToken = jar.get("session")?.value;
    const target = sessionToken
      ? appendTokenToRedirect(appRedirect, sessionToken)
      : appRedirect;
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext();

  if (error) {
    setFlashCookie(jar, "חיבור Gmail בוטל", "error");
    return redirectToAppOrNext(jar, url, next);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    setFlashCookie(jar, "שגיאת OAuth — נסה שוב", "error");
    return redirectToAppOrNext(jar, url, next);
  }

  try {
    const tokens = await exchangeGmailCode(code);
    const existing = await getIntegrationToken(GOOGLE_GMAIL_PROVIDER);
    const refreshToken = tokens.refresh_token ?? existing?.refresh_token;

    if (!refreshToken) throw new Error("missing_refresh_token");

    await saveIntegrationToken({
      provider: GOOGLE_GMAIL_PROVIDER,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });

    setFlashCookie(jar, "Gmail מחובר — הבוט יכול לקרוא מיילים");
    return redirectToAppOrNext(jar, url, next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "missing_refresh_token") {
      setFlashCookie(jar, "החיבור נכשל — נסה שוב (נדרש אישור מלא)", "error");
    } else if (msg.startsWith("token_exchange_failed")) {
      setFlashCookie(jar, "שגיאת OAuth — בדוק Redirect URI ב-Google Console", "error");
    } else {
      setFlashCookie(jar, "חיבור Gmail נכשל", "error");
    }
    return redirectToAppOrNext(jar, url, next);
  }
}
