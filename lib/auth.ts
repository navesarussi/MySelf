export const SESSION_COOKIE = "myself_session";

/**
 * Session tokens.
 *
 * The original token was `hmac(AUTH_SECRET, "authenticated-v1")` — one constant
 * string. Every signed-in device held the same value, it carried no identity, it
 * never expired, and a single leak (a log line, a shared device, the `?token=`
 * query parameter the native OAuth flow used) was a permanent master key that
 * could only be revoked by rotating AUTH_SECRET and signing everyone out.
 *
 * A v2 token is `v2.<payload>.<signature>`: base64url JSON claims plus an
 * HMAC-SHA256 over the signed part. It names the account, expires, and is
 * distinct per user — the identity every future per-user query will need.
 *
 * Legacy tokens stay valid so installed native builds are not signed out by a
 * deploy; set SESSION_REJECT_LEGACY=1 once the fleet has rolled over.
 *
 * Everything here also runs in the Edge runtime (proxy.ts), so it uses
 * crypto.subtle and btoa/atob rather than node:crypto.
 */

export const LEGACY_SESSION_TOKEN_PAYLOAD = "authenticated-v1";

const TOKEN_VERSION = "v2";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;
/** Ask the client for a fresh token once two thirds of the lifetime is gone. */
const REFRESH_AFTER_FRACTION = 2 / 3;
/** Tolerated clock difference between the issuing and verifying runtime. */
const CLOCK_SKEW_SECONDS = 120;
const SCOPED_TTL_SECONDS = 300;

export type SessionClaims = {
  /** Signed-in account (Google email). */
  sub: string;
  /** Issued-at / expiry, seconds since the epoch. */
  iat: number;
  exp: number;
  /** Audience — absent on a session token, set on a scoped one. */
  aud?: string;
};

// ── encoding ────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    keyCache.set(secret, key);
  }
  return key;
}

async function sign(secret: string, message: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message));
}

/** Length-independent equality.
 *
 *  `===` on a secret returns as soon as two bytes differ, so how long the
 *  comparison takes leaks how much of the prefix was right. Written by hand
 *  rather than with node:crypto.timingSafeEqual because this module also runs
 *  in the Edge runtime (proxy.ts), where node:crypto is unavailable. */
export function safeEqual(a: string, b: string): boolean {
  // Length difference is folded in rather than short-circuited on, and the loop
  // always runs to the longer length. charCodeAt past the end is NaN, which
  // `| 0` normalises to 0 — a mismatch the length term above still catches.
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

// ── issuing ─────────────────────────────────────────────────────────────────

async function mint(secret: string, claims: SessionClaims): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(claims)));
  const signed = `${TOKEN_VERSION}.${payload}`;
  return `${signed}.${base64url(new Uint8Array(await sign(secret, signed)))}`;
}

export async function makeSessionToken(
  secret: string,
  email: string,
  opts: { now?: number; ttlSeconds?: number } = {}
): Promise<string> {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  return mint(secret, {
    sub: email.trim().toLowerCase(),
    iat,
    exp: iat + (opts.ttlSeconds ?? SESSION_TTL_SECONDS),
  });
}

/**
 * A single-purpose, short-lived token for a flow that has to carry credentials
 * somewhere exposed — the native OAuth start, whose URL lands in browser
 * history, Referer headers and server logs. Minting one of these instead of
 * putting the 90-day session token in a query string bounds that exposure to
 * five minutes and to one audience.
 */
export async function mintScopedToken(
  secret: string,
  audience: string,
  email: string,
  opts: { now?: number; ttlSeconds?: number } = {}
): Promise<string> {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  return mint(secret, {
    sub: email.trim().toLowerCase(),
    iat,
    exp: iat + (opts.ttlSeconds ?? SCOPED_TTL_SECONDS),
    aud: audience,
  });
}

// ── verifying ───────────────────────────────────────────────────────────────

async function readToken(token: string | undefined | null, secret: string, nowMs: number): Promise<SessionClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [version, payload, signature] = parts;
  if (version !== TOKEN_VERSION || !payload || !signature) return null;

  const expected = base64url(new Uint8Array(await sign(secret, `${version}.${payload}`)));
  if (!safeEqual(signature, expected)) return null;

  const bytes = fromBase64url(payload);
  if (!bytes) return null;
  let claims: SessionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(bytes)) as SessionClaims;
  } catch {
    return null;
  }
  if (typeof claims?.sub !== "string" || !claims.sub) return null;
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null;

  const now = Math.floor(nowMs / 1000);
  if (claims.exp <= now) return null;
  if (claims.iat > now + CLOCK_SKEW_SECONDS) return null;
  return claims;
}

/** Claims of a valid v2 *session* token (no audience). Null for anything else. */
export async function readSessionToken(
  token: string | undefined | null,
  secret: string,
  nowMs = Date.now()
): Promise<SessionClaims | null> {
  const claims = await readToken(token, secret, nowMs);
  return claims && claims.aud === undefined ? claims : null;
}

/** Claims of a valid scoped token, but only for the audience asked for. */
export async function verifyScopedToken(
  token: string | undefined | null,
  secret: string,
  audience: string,
  nowMs = Date.now()
): Promise<SessionClaims | null> {
  const claims = await readToken(token, secret, nowMs);
  return claims && claims.aud === audience ? claims : null;
}

export function sessionNeedsRefresh(claims: SessionClaims, nowMs = Date.now()): boolean {
  const life = claims.exp - claims.iat;
  if (life <= 0) return true;
  return Math.floor(nowMs / 1000) - claims.iat >= life * REFRESH_AFTER_FRACTION;
}

// ── legacy (pre-identity) tokens ────────────────────────────────────────────

const legacyCache = new Map<string, Promise<string>>();

/** The constant token every install carried before v2. */
export function legacySessionToken(secret: string): Promise<string> {
  let token = legacyCache.get(secret);
  if (!token) {
    token = sign(secret, LEGACY_SESSION_TOKEN_PAYLOAD).then(toHex);
    legacyCache.set(secret, token);
  }
  return token;
}

function legacyAccepted(): boolean {
  return process.env.SESSION_REJECT_LEGACY !== "1";
}

export async function isValidSessionToken(
  token: string | undefined,
  secret: string,
  nowMs = Date.now()
): Promise<boolean> {
  if (!token) return false;
  if (await readSessionToken(token, secret, nowMs)) return true;
  if (!legacyAccepted()) return false;
  return safeEqual(token, await legacySessionToken(secret));
}

// ── cookie ──────────────────────────────────────────────────────────────────

export async function applySessionCookie(
  res: { cookies: { set: (name: string, value: string, opts: object) => void } },
  secret: string,
  email: string
) {
  const token = await makeSessionToken(secret, email);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}
