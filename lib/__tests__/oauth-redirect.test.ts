import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redirectToAppOrNext } from "../integrations/oauth-redirect";
import { SESSION_COOKIE } from "../auth";

type Entry = { value: string };

/** Minimal stand-in for the Next cookie jar surface the helper touches. */
function makeJar(initial: Record<string, string>) {
  const store = new Map<string, Entry>(
    Object.entries(initial).map(([k, v]) => [k, { value: v }])
  );
  return {
    deleted: [] as string[],
    get(name: string) {
      return store.get(name);
    },
    delete(name: string) {
      store.delete(name);
      this.deleted.push(name);
    },
  };
}

const APP_COOKIE = "github_oauth_app_redirect";
const ORIGIN = "https://myselfapp.xyz";

function locationOf(res: { headers: { get(n: string): string | null } }) {
  return res.headers.get("location") ?? "";
}

describe("redirectToAppOrNext", () => {
  it("appends the session token from the real cookie name", () => {
    // Regression: the helper used to read jar.get("session"), but the cookie is
    // SESSION_COOKIE ("myself_session"), so every deep link lost its token.
    const jar = makeJar({
      [APP_COOKIE]: "myself://auth",
      [SESSION_COOKIE]: "tok-abc",
    });
    const res = redirectToAppOrNext({
      jar: jar as never,
      origin: ORIGIN,
      next: "/settings",
      appRedirectCookie: APP_COOKIE,
    });
    assert.equal(locationOf(res), "myself://auth?token=tok-abc");
  });

  it("prefers an explicitly supplied token over the request cookie", () => {
    // Google login mints the session on this response, so the fresh token wins.
    const jar = makeJar({ [APP_COOKIE]: "myself://auth", [SESSION_COOKIE]: "stale" });
    const res = redirectToAppOrNext({
      jar: jar as never,
      origin: ORIGIN,
      next: "/",
      appRedirectCookie: APP_COOKIE,
      sessionToken: "fresh",
    });
    assert.equal(locationOf(res), "myself://auth?token=fresh");
  });

  it("redirects without a token when no session exists", () => {
    const jar = makeJar({ [APP_COOKIE]: "myself://auth" });
    const res = redirectToAppOrNext({
      jar: jar as never,
      origin: ORIGIN,
      next: "/",
      appRedirectCookie: APP_COOKIE,
    });
    assert.equal(locationOf(res), "myself://auth");
  });

  it("ignores a disallowed app redirect and falls back to next", () => {
    const jar = makeJar({ [APP_COOKIE]: "https://evil.example.com/steal", [SESSION_COOKIE]: "tok" });
    const res = redirectToAppOrNext({
      jar: jar as never,
      origin: ORIGIN,
      next: "/settings",
      appRedirectCookie: APP_COOKIE,
    });
    assert.equal(locationOf(res), `${ORIGIN}/settings`);
  });

  it("always clears the app-redirect cookie", () => {
    const jar = makeJar({ [APP_COOKIE]: "myself://auth" });
    redirectToAppOrNext({
      jar: jar as never,
      origin: ORIGIN,
      next: "/",
      appRedirectCookie: APP_COOKIE,
    });
    assert.deepEqual(jar.deleted, [APP_COOKIE]);
  });
});
