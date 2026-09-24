import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth";
import { explicitUserId, NoUserContextError } from "@/lib/db/user-context";

/** The account named by the current request's v2 session token (Bearer first, then cookie). */
async function requestSessionUser(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  let bearer: string | undefined;
  let cookie: string | undefined;
  try {
    const auth = (await headers()).get("authorization");
    bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() || undefined : undefined;
    cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    // Not inside a request (a script, a test, a detached callback).
    return null;
  }

  for (const token of [bearer, cookie]) {
    const claims = await readSessionToken(token, secret);
    if (claims) return claims.sub;
  }
  return null;
}

/**
 * Who per-account data is read and written for: the account a `runAsUser` block
 * names, else the one the request's session names. A legacy (anonymous) token
 * names nobody. With no account the call throws — per-account data has no safe
 * default.
 */
export async function currentUserId(): Promise<string> {
  const explicit = explicitUserId();
  if (explicit) return explicit;
  const fromRequest = await requestSessionUser();
  if (fromRequest) return fromRequest.trim().toLowerCase();
  throw new NoUserContextError();
}
