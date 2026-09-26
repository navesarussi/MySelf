import { NextRequest, NextResponse } from "next/server";
import { hasValidSession, sessionIdentity, unauthorized } from "@/lib/api/auth";
import { makeSessionToken, sessionNeedsRefresh } from "@/lib/auth";
import { isPrimaryGoogleEmail } from "@/lib/integrations/google-auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/**
 * Session probe — the app calls this on launch and after sign-in.
 *
 * It doubles as the rolling refresh: once a token is two thirds through its
 * life the response carries a fresh one, which the client stores. Without that
 * a 90-day expiry would just log everyone out on day 90; with it a device in
 * regular use never sees an expiry, while a device that stops checking in
 * loses access on schedule — which is the point of having an expiry at all.
 */
export const GET = withRouteHandler(async function GET(req: NextRequest) {
  if (!(await hasValidSession(req))) return unauthorized();

  const identity = await sessionIdentity(req);
  if (!identity) {
    // Valid, but a pre-identity legacy token: it cannot be refreshed and does
    // not expire. `legacy: true` lets the client decide to re-authenticate.
    return NextResponse.json({ ok: true, legacy: true });
  }

  const secret = process.env.AUTH_SECRET;
  const refreshed =
    secret && sessionNeedsRefresh(identity) ? await makeSessionToken(secret, identity.sub) : null;

  return NextResponse.json({
    ok: true,
    email: identity.sub,
    // Trading belongs to the primary account; the app hides it for the others.
    primary: await isPrimaryGoogleEmail(identity.sub),
    expires_at: new Date(identity.exp * 1000).toISOString(),
    ...(refreshed ? { token: refreshed } : {}),
  });
});
