export const SESSION_COOKIE = "myself_session";
const SESSION_PAYLOAD = "authenticated-v1";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(SESSION_PAYLOAD));
  return toHex(sig);
}

export async function makeSessionToken(secret: string) {
  return hmac(secret);
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

export async function applySessionCookie(
  res: { cookies: { set: (name: string, value: string, opts: object) => void } },
  secret: string
) {
  const token = await makeSessionToken(secret);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

let cachedSecret: string | null = null;
let cachedExpected: string | null = null;

export async function isValidSessionToken(token: string | undefined, secret: string) {
  if (!token) return false;
  if (cachedSecret !== secret || !cachedExpected) {
    cachedSecret = secret;
    cachedExpected = await hmac(secret);
  }
  return token === cachedExpected;
}
