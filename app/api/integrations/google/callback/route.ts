import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/integrations/google-calendar/client";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar/sync";
import { GOOGLE_PROVIDER } from "@/lib/integrations/google-config";
import { saveIntegrationToken } from "@/lib/integrations/tokens";
import { consumeOAuthState } from "@/lib/integrations/oauth-state";
import { setFlashCookie } from "@/lib/flash";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const jar = await cookies();
  const error = url.searchParams.get("error");

  if (error) {
    setFlashCookie(jar, "חיבור יומן גוגל בוטל", "error");
    return NextResponse.redirect(new URL("/settings", url.origin));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !(await consumeOAuthState(state))) {
    setFlashCookie(jar, "שגיאה בחיבור יומן גוגל", "error");
    return NextResponse.redirect(new URL("/settings", url.origin));
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) throw new Error("missing_refresh_token");

    await saveIntegrationToken({
      provider: GOOGLE_PROVIDER,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });

    const { imported } = await syncGoogleCalendar();
    setFlashCookie(jar, `יומן גוגל מחובר — סונכרנו ${imported} אירועים`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (msg === "missing_refresh_token") {
      setFlashCookie(jar, "חיבור נכשל — נסה שוב (נדרש אישור מלא)", "error");
    } else if (msg.startsWith("token_exchange_failed")) {
      setFlashCookie(jar, "שגיאה בחיבור — בדוק Redirect URI ב-Google Console", "error");
    } else if (msg.startsWith("sync_") || msg.startsWith("calendar_fetch_failed")) {
      setFlashCookie(jar, "יומן מחובר אך הסנכרון נכשל — נסה סנכרון ידני", "error");
    } else {
      setFlashCookie(jar, "שגיאה בחיבור יומן גוגל", "error");
    }
  }

  return NextResponse.redirect(new URL("/settings", url.origin));
}
