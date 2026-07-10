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

export async function isValidSessionToken(token: string | undefined, secret: string) {
  if (!token) return false;
  const expected = await hmac(secret);
  return token === expected;
}
