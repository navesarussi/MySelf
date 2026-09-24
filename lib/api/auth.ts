import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSessionToken, readSessionToken, verifyScopedToken, type SessionClaims } from "@/lib/auth";
import { isPrimaryGoogleEmail } from "@/lib/integrations/google-auth";

/** The token this request presents, Bearer first then cookie. */
async function requestTokens(req: NextRequest): Promise<(string | undefined)[]> {
  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  const jar = await cookies();
  return [bearer || undefined, jar.get(SESSION_COOKIE)?.value];
}

/** Any valid session, including a pre-identity legacy token. Only the session
 *  probe wants this: it answers a legacy token with `legacy: true` so the client
 *  knows to sign in again. */
export async function hasValidSession(req: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  for (const token of await requestTokens(req)) {
    if (await isValidSessionToken(token, secret)) return true;
  }
  return false;
}

/** Route-level auth check for /api/v1 handlers — defense in depth on top of
 *  proxy.ts. Accepts the session token as a Bearer header or the cookie, and
 *  requires it to name an account: every data route reads or writes some
 *  account's rows, and a legacy token names none. */
export async function isApiAuthorized(req: NextRequest): Promise<boolean> {
  return (await sessionIdentity(req)) !== null;
}

/** Trading is one engine on one brokerage account: only the primary account
 *  may reach it. 401 without a session, 403 for any other account. */
export async function denyUnlessPrimary(req: NextRequest): Promise<NextResponse | null> {
  const identity = await sessionIdentity(req);
  if (!identity) return unauthorized();
  if (!(await isPrimaryGoogleEmail(identity.sub))) return forbidden();
  return null;
}

/**
 * Who this request is, when the token says so. Null for an unauthenticated
 * request *and* for a pre-identity legacy token, which is valid but anonymous —
 * callers that need a name (minting a new token, per-user data) must treat the
 * two the same and not invent an identity.
 */
export async function sessionIdentity(req: NextRequest): Promise<SessionClaims | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  for (const token of await requestTokens(req)) {
    const claims = await readSessionToken(token, secret);
    if (claims) return claims;
  }
  return null;
}

/** Auth for OAuth *initiation* routes, which are browser navigations rather
 *  than fetches.
 *
 *  The web SPA arrives with the session cookie. The native app cannot set an
 *  Authorization header on a navigation and opens the URL in a system browser
 *  that may not carry the cookie, so it passes the same session token as a
 *  `token` query parameter — the mirror of how the callback hands the token
 *  back through the deep link. */
export const OAUTH_START_AUDIENCE = "oauth-start";

/** The account starting an OAuth connect — the integration's tokens are stored
 *  for it. Null when unauthenticated or when only a legacy (anonymous) token is
 *  presented. */
export async function oauthStartIdentity(req: NextRequest): Promise<string | null> {
  const session = await sessionIdentity(req);
  if (session) return session.sub;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const queryToken = req.nextUrl.searchParams.get("token") ?? undefined;
  // Preferred: a five-minute token minted for this one purpose. A URL ends up in
  // browser history, Referer headers and access logs, so what travels there must
  // not be the 90-day session token.
  const scoped = await verifyScopedToken(queryToken, secret, OAUTH_START_AUDIENCE);
  if (scoped) return scoped.sub;
  // Installed native builds that still pass the session token itself.
  return (await readSessionToken(queryToken, secret))?.sub ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function dbError(message = "db_error") {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function conflict(message = "duplicate") {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/** Body parse that tolerates empty bodies. */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const data = (await req.json()) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const optStr = (v: unknown) => {
  const s = str(v);
  return s || null;
};
