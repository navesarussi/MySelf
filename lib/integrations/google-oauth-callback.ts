import { NextRequest, NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCode,
  fetchGoogleUserEmail,
} from "@/lib/integrations/google-calendar/client";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { ensureAccountRow, isAllowedGoogleEmail, isPrimaryGoogleEmail } from "@/lib/integrations/google-auth";
import { runAsUser } from "@/lib/db/user-context";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { saveGoogleTokensToAllProviders } from "@/lib/integrations/google-unified";
import { getIntegrationToken, tryStartSync } from "@/lib/integrations/tokens";
import { consumeOAuthNext, consumeOAuthState } from "@/lib/integrations/oauth-state";
import { redirectToAppOrNext } from "@/lib/integrations/oauth-redirect";
import { applySessionCookie, makeSessionToken } from "@/lib/auth";
import { setFlashCookie } from "@/lib/flash";

const APP_REDIRECT_COOKIE = "google_oauth_app_redirect";


export async function handleGoogleOAuthCallback(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");
  const next = await consumeOAuthNext("google");

  if (error) {
    setFlashCookie(jar, "הכניסה בוטלה", "error");
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState("google", state))) {
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

    // Every per-account row references the account's allowlist row; an account
    // allowed only through ALLOWED_GOOGLE_EMAIL gets one on first sign-in.
    await ensureAccountRow(email);
    const isPrimary = await isPrimaryGoogleEmail(email);

    // This request carries no session yet, so the account is named explicitly.
    if (isPrimary) {
      await runAsUser(email, async () => {
        const existing = await getIntegrationToken(GOOGLE_PROVIDER);
        const refreshToken = tokens.refresh_token ?? existing?.refresh_token;
        if (!refreshToken) throw new Error("missing_refresh_token");

        await saveGoogleTokensToAllProviders(tokens);
      });
    }

    // This response mints the session, so the cookie is not on the request yet —
    // hand the deep link the same token applySessionCookie is about to set.
    const sessionToken = await makeSessionToken(secret, email);
    const res = redirectToAppOrNext({
      jar,
      origin: url.origin,
      next,
      appRedirectCookie: APP_REDIRECT_COOKIE,
      sessionToken,
    });
    await applySessionCookie(res, secret, email);

    if (isPrimary) {
      setFlashCookie(jar, "Google מחובר — יומן, משימות ומייל");
      if (await runAsUser(email, () => tryStartSync(GOOGLE_PROVIDER))) {
        after(() =>
          runAsUser(email, async () => {
            try {
              await syncGoogleCalendar();
            } catch {
              // sync status is persisted as failed
            }
          })
        );
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
