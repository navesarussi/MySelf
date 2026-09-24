import { mintScopedToken, verifyScopedToken } from "@/lib/auth";

/**
 * OAuth `state` that also says which account started the connect.
 *
 * The callback is a browser navigation that may not carry the session — the
 * native app opens it in a system browser — yet the tokens it receives must be
 * stored for that account. So the state is a ten-minute signed token naming it,
 * still matched against the state cookie for CSRF as before.
 */
const AUDIENCE = "oauth-state";
const TTL_SECONDS = 600;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("auth_secret_missing");
  return value;
}

export function mintOAuthState(email: string, nowMs = Date.now()): Promise<string> {
  return mintScopedToken(secret(), AUDIENCE, email, { now: nowMs, ttlSeconds: TTL_SECONDS });
}

export async function oauthStateAccount(state: string, nowMs = Date.now()): Promise<string | null> {
  const claims = await verifyScopedToken(state, secret(), AUDIENCE, nowMs);
  return claims?.sub ?? null;
}
