import { NextRequest, NextResponse } from "next/server";
import { OAUTH_START_AUDIENCE, sessionIdentity, unauthorized } from "@/lib/api/auth";
import { mintScopedToken } from "@/lib/auth";
import { withRouteHandler } from "@/lib/api/with-route-handler";

/**
 * A five-minute token the app puts in an OAuth *start* URL.
 *
 * The native app cannot set an Authorization header on a system-browser
 * navigation, so the connect URL has to carry the credential itself — and a URL
 * is written to browser history, sent as a Referer and recorded in access logs.
 * Handing over the 90-day session token there made every one of those places a
 * copy of the master credential. This token opens nothing but the OAuth start
 * routes and is dead five minutes later.
 */
export const POST = withRouteHandler(async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return unauthorized();
  const identity = await sessionIdentity(req);
  if (!identity) return unauthorized();

  const token = await mintScopedToken(secret, OAUTH_START_AUDIENCE, identity.sub);
  return NextResponse.json({ token });
});
