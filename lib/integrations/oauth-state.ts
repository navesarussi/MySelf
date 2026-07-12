import { cookies } from "next/headers";

const COOKIE = "google_oauth_state";

export async function setOAuthState(state: string) {
  const jar = await cookies();
  jar.set(COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function consumeOAuthState(expected: string) {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  return value === expected;
}
