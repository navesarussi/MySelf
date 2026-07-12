import { cookies } from "next/headers";

const COOKIE = "google_oauth_state";
const NEXT_COOKIE = "google_oauth_next";

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

export async function setOAuthState(state: string, next?: string) {
  const jar = await cookies();
  jar.set(COOKIE, state, cookieOpts);
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    jar.set(NEXT_COOKIE, next, cookieOpts);
  }
}

export async function consumeOAuthState(expected: string) {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  return value === expected;
}

export async function consumeOAuthNext() {
  const jar = await cookies();
  const next = jar.get(NEXT_COOKIE)?.value;
  jar.delete(NEXT_COOKIE);
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}
