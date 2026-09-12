import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCode,
  fetchGoogleUserEmail,
} from "@/lib/integrations/google-calendar/client";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { isAllowedGoogleEmail, isPrimaryGoogleEmail } from "@/lib/integrations/google-auth";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { saveGoogleTokensToAllProviders } from "@/lib/integrations/google-unified";
import { getIntegrationToken, tryStartSync } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import {
  appendTokenToRedirect,
  isAllowedAppRedirect,
} from "@/lib/integrations/mobile-redirect";
import { applySessionCookie } from "@/lib/auth";
import { setFlashCookie } from "@/lib/flash";

const APP_REDIRECT_COOKIE = "google_oauth_app_redirect";

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

export async function handleGoogleOAuthCallback(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext();

  if (error) {
    setFlashCookie(jar, "הכניסה בוטלה", "error");
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    setFlashCookie(jar, "שגיאה בכניסה — נסה שוב", "error");
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    setFlashCookie(jar, "האתר לא הוגדר כראוי", "error");
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  try {
    const tokens = await exchangeCode(code);
    const email = await fetchGoogleUserEmail(tokens.access_token);

    if (!(await isAllowedGoogleEmail(email))) {
      setFlashCookie(jar, "חשבון Google זה אינו מורשה", "error");
      return NextResponse.redirect(new URL("/login", url.origin));
    }

    const isPrimary = await isPrimaryGoogleEmail(email);

    if (isPrimary) {
      const existing = await getIntegrationToken(GOOGLE_PROVIDER);
      const refreshToken = tokens.refresh_token ?? existing?.refresh_token;
      if (!refreshToken) throw new Error("missing_refresh_token");

      await saveGoogleTokensToAllProviders(tokens);
    }

    const res = redirectToAppOrNext(jar, url, next);
    await applySessionCookie(res, secret);

    if (isPrimary) {
      setFlashCookie(jar, "Google מחובר — יומן, משימות ומייל");
      if (await tryStartSync(GOOGLE_PROVIDER)) {
        after(async () => {
          try {
            await syncGoogleCalendar();
          } catch {
            // sync status is persisted as failed
          }
        });
      }
    } else {
      setFlashCookie(jar, "מחובר");
    }
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "missing_refresh_token") {
      setFlashCookie(jar, "כניסה נכשלה — נסה שוב (נדרש אישור מלא)", "error");
    } else if (msg.startsWith("token_exchange_failed")) {
      setFlashCookie(jar, "שגיאה בכניסה — בדוק Redirect URI ב-Google Console", "error");
    } else {
      setFlashCookie(jar, "שגיאה בכניסה", "error");
    }
    return NextResponse.redirect(new URL("/login", url.origin));
  }
}
