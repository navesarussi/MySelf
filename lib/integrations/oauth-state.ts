import { cookies } from "next/headers";

/**
 * OAuth CSRF state, scoped per provider family.
 *
 * Every provider used to share one `google_oauth_state` cookie, so starting a
 * second connect while another was pending silently overwrote the first and the
 * original callback failed its state check. Scoping keeps concurrent connects
 * independent.
 *
 * Gmail and Google Tasks ride the unified Google login flow, so they share the
 * "google" scope with Calendar — the flow that actually sets the state.
 */
export type OAuthScope = "google" | "github" | "monday";

const LEGACY_COOKIE = "google_oauth_state";
const LEGACY_NEXT_COOKIE = "google_oauth_next";

const stateCookie = (scope: OAuthScope) => `${scope}_oauth_state`;
const nextCookie = (scope: OAuthScope) => `${scope}_oauth_next`;

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
}

export async function setOAuthState(scope: OAuthScope, state: string, next?: string) {
  const jar = await cookies();
  jar.set(stateCookie(scope), state, cookieOpts);
  const path = safeNext(next);
  if (path) jar.set(nextCookie(scope), path, cookieOpts);
}

export async function consumeOAuthState(scope: OAuthScope, expected: string) {
  const jar = await cookies();
  const scoped = jar.get(stateCookie(scope))?.value;
  jar.delete(stateCookie(scope));

  // Accept the pre-scoping cookie so flows already in flight across a deploy
  // still complete. It expires on its own within 10 minutes.
  const legacy = scoped === undefined ? jar.get(LEGACY_COOKIE)?.value : undefined;
  if (legacy !== undefined) jar.delete(LEGACY_COOKIE);

  const actual = scoped ?? legacy;
  return actual !== undefined && actual === expected;
}

export async function consumeOAuthNext(scope: OAuthScope) {
  const jar = await cookies();
  const scoped = jar.get(nextCookie(scope))?.value;
  jar.delete(nextCookie(scope));

  const legacy = scoped === undefined ? jar.get(LEGACY_NEXT_COOKIE)?.value : undefined;
  if (legacy !== undefined) jar.delete(LEGACY_NEXT_COOKIE);

  return safeNext(scoped ?? legacy) ?? "/";
}
