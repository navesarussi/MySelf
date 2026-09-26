import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeGmailCode } from "@/lib/integrations/gmail/client";
import { GOOGLE_GMAIL_PROVIDER } from "@/lib/integrations/google-config";
import { getIntegrationToken, saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import { redirectToAppOrNext } from "@/lib/integrations/oauth-redirect";
import { setFlashCookie } from "@/lib/flash";
import { withRouteHandler } from "@/lib/api/with-route-handler";

const APP_REDIRECT_COOKIE = "gmail_oauth_app_redirect";


export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext("google");

  if (error) {
    setFlashCookie(jar, "חיבור Gmail בוטל", "error");
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState("google", state))) {
    setFlashCookie(jar, "שגיאת OAuth — נסה שוב", "error");
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
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
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "missing_refresh_token") {
      setFlashCookie(jar, "החיבור נכשל — נסה שוב (נדרש אישור מלא)", "error");
    } else if (msg.startsWith("token_exchange_failed")) {
      setFlashCookie(jar, "שגיאת OAuth — בדוק Redirect URI ב-Google Console", "error");
    } else {
      setFlashCookie(jar, "חיבור Gmail נכשל", "error");
    }
    return redirectToAppOrNext({ jar, origin: url.origin, next, appRedirectCookie: APP_REDIRECT_COOKIE });
  }
});
