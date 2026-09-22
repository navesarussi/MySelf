import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_SESSION_TOKEN_PAYLOAD,
  isValidSessionToken,
  legacySessionToken,
  makeSessionToken,
  mintScopedToken,
  readSessionToken,
  sessionNeedsRefresh,
  verifyScopedToken,
} from "../auth";

const SECRET = "test-secret-do-not-use";
const OTHER = "another-secret";
const DAY = 86_400;

describe("session token", () => {
  it("carries the signed-in identity", async () => {
    const token = await makeSessionToken(SECRET, "navesarussi@gmail.com");
    const claims = await readSessionToken(token, SECRET);
    assert.equal(claims?.sub, "navesarussi@gmail.com");
  });

  it("issues a different token per identity", async () => {
    const a = await makeSessionToken(SECRET, "a@example.com");
    const b = await makeSessionToken(SECRET, "b@example.com");
    assert.notEqual(a, b, "one shared constant for every user was the old behaviour");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await makeSessionToken(OTHER, "a@example.com");
    assert.equal(await readSessionToken(token, SECRET), null);
    assert.equal(await isValidSessionToken(token, SECRET), false);
  });

  it("rejects a tampered payload", async () => {
    const token = await makeSessionToken(SECRET, "a@example.com");
    const [v, payload, sig] = token.split(".");
    const forged = await makeSessionToken(SECRET, "attacker@example.com");
    const forgedPayload = forged.split(".")[1];
    assert.equal(await readSessionToken(`${v}.${forgedPayload}.${sig}`, SECRET), null);
    assert.equal(await readSessionToken(`${v}.${payload}.${sig.slice(0, -2)}xx`, SECRET), null);
  });

  it("expires", async () => {
    const now = Date.now();
    const token = await makeSessionToken(SECRET, "a@example.com", { now, ttlSeconds: 60 });
    assert.ok(await readSessionToken(token, SECRET, now + 30_000));
    assert.equal(await readSessionToken(token, SECRET, now + 61_000), null);
    assert.equal(await isValidSessionToken(token, SECRET, now + 61_000), false);
  });

  it("rejects a token issued in the future beyond clock skew", async () => {
    const now = Date.now();
    const token = await makeSessionToken(SECRET, "a@example.com", { now: now + 3600_000 });
    assert.equal(await readSessionToken(token, SECRET, now), null);
  });

  it("rejects malformed input instead of throwing", async () => {
    for (const bad of ["", "abc", "v2.", "v2.a.b.c", "v9.a.b", "...", "v2..sig"]) {
      assert.equal(await readSessionToken(bad, SECRET), null, `rejected: ${JSON.stringify(bad)}`);
    }
    assert.equal(await readSessionToken(undefined, SECRET), null);
  });

  it("asks for a refresh only in the last part of its life", async () => {
    const now = Date.now();
    const ttl = 90 * DAY;
    const token = await makeSessionToken(SECRET, "a@example.com", { now, ttlSeconds: ttl });
    const claims = (await readSessionToken(token, SECRET, now))!;
    assert.equal(sessionNeedsRefresh(claims, now), false);
    assert.equal(sessionNeedsRefresh(claims, now + 45 * DAY * 1000), false);
    assert.equal(sessionNeedsRefresh(claims, now + 75 * DAY * 1000), true);
  });
});

describe("legacy session token", () => {
  it("is still accepted so existing installs are not signed out", async () => {
    const legacy = await legacySessionToken(SECRET);
    assert.equal(await isValidSessionToken(legacy, SECRET), true);
    assert.equal(LEGACY_SESSION_TOKEN_PAYLOAD, "authenticated-v1");
  });

  it("carries no identity, which is why it is being replaced", async () => {
    const legacy = await legacySessionToken(SECRET);
    assert.equal(await readSessionToken(legacy, SECRET), null);
  });

  it("is refused once legacy acceptance is switched off", async () => {
    const legacy = await legacySessionToken(SECRET);
    const prev = process.env.SESSION_REJECT_LEGACY;
    try {
      process.env.SESSION_REJECT_LEGACY = "1";
      assert.equal(await isValidSessionToken(legacy, SECRET), false);
      const v2 = await makeSessionToken(SECRET, "a@example.com");
      assert.equal(await isValidSessionToken(v2, SECRET), true);
    } finally {
      if (prev === undefined) delete process.env.SESSION_REJECT_LEGACY;
      else process.env.SESSION_REJECT_LEGACY = prev;
    }
  });

  it("does not accept the legacy token of a different secret", async () => {
    assert.equal(await isValidSessionToken(await legacySessionToken(OTHER), SECRET), false);
  });
});

describe("scoped tokens", () => {
  it("round-trips within its audience and lifetime", async () => {
    const now = Date.now();
    const token = await mintScopedToken(SECRET, "oauth-start", "a@example.com", { now });
    const claims = await verifyScopedToken(token, SECRET, "oauth-start", now + 60_000);
    assert.equal(claims?.sub, "a@example.com");
  });

  it("is short-lived", async () => {
    const now = Date.now();
    const token = await mintScopedToken(SECRET, "oauth-start", "a@example.com", { now });
    assert.equal(await verifyScopedToken(token, SECRET, "oauth-start", now + 3600_000), null);
  });

  it("is not valid for another audience, and is not a session token", async () => {
    const now = Date.now();
    const token = await mintScopedToken(SECRET, "oauth-start", "a@example.com", { now });
    assert.equal(await verifyScopedToken(token, SECRET, "something-else", now), null);
    assert.equal(
      await isValidSessionToken(token, SECRET, now),
      false,
      "a URL-borne start token must not open the API"
    );
  });

  it("does not accept a session token in place of a scoped one", async () => {
    const session = await makeSessionToken(SECRET, "a@example.com");
    assert.equal(await verifyScopedToken(session, SECRET, "oauth-start"), null);
  });
});
