import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bearerToken, matchesAnySecret } from "../api/cron-auth";

const headers = (authorization: string | null) => ({
  headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? authorization : null) },
});

describe("bearerToken", () => {
  it("extracts a bearer token", () => {
    assert.equal(bearerToken("Bearer abc123"), "abc123");
    assert.equal(bearerToken("Bearer  padded  "), "padded");
  });

  it("returns null for anything that is not a non-empty bearer token", () => {
    assert.equal(bearerToken(null), null);
    assert.equal(bearerToken(undefined), null);
    assert.equal(bearerToken(""), null);
    assert.equal(bearerToken("Basic abc"), null);
    assert.equal(bearerToken("bearer abc"), null, "scheme is case-sensitive, as before");
    assert.equal(bearerToken("Bearer "), null);
    assert.equal(bearerToken("Bearer    "), null);
  });
});

describe("matchesAnySecret", () => {
  it("accepts a token equal to any configured secret", () => {
    assert.equal(matchesAnySecret("Bearer one", ["one", "two"]), true);
    assert.equal(matchesAnySecret("Bearer two", ["one", "two"]), true);
  });

  it("rejects a wrong, empty or absent token", () => {
    assert.equal(matchesAnySecret("Bearer three", ["one", "two"]), false);
    assert.equal(matchesAnySecret(null, ["one"]), false);
    assert.equal(matchesAnySecret("Bearer ", ["one"]), false);
  });

  it("never authorizes when no secret is configured", () => {
    // The old `authHeader === \`Bearer ${undefined}\`` shape could be satisfied
    // by literally sending "Bearer undefined" if a guard was missed.
    assert.equal(matchesAnySecret("Bearer undefined", [undefined]), false);
    assert.equal(matchesAnySecret("Bearer ", [undefined, null, "", "   "]), false);
    assert.equal(matchesAnySecret("Bearer x", []), false);
  });

  it("ignores surrounding whitespace on the configured secret", () => {
    assert.equal(matchesAnySecret("Bearer one", ["  one  "]), true);
  });

  it("does not match a prefix of the secret", () => {
    assert.equal(matchesAnySecret("Bearer sec", ["secret"]), false);
    assert.equal(matchesAnySecret("Bearer secretary", ["secret"]), false);
  });
});

describe("isCronAuthorized / isTradingCronAuthorized", () => {
  it("reads the secrets from the environment at call time", async () => {
    const { isCronAuthorized, isTradingCronAuthorized } = await import("../api/cron-auth");
    const prevCron = process.env.CRON_SECRET;
    const prevTrading = process.env.TRADING_CRON_SECRET;
    try {
      process.env.CRON_SECRET = "shared-secret";
      process.env.TRADING_CRON_SECRET = "trading-secret";
      assert.equal(isCronAuthorized(headers("Bearer shared-secret")), true);
      assert.equal(isCronAuthorized(headers("Bearer trading-secret")), false);
      assert.equal(isTradingCronAuthorized(headers("Bearer trading-secret")), true);
      assert.equal(isTradingCronAuthorized(headers("Bearer shared-secret")), true);
      assert.equal(isTradingCronAuthorized(headers("Bearer nope")), false);

      delete process.env.CRON_SECRET;
      delete process.env.TRADING_CRON_SECRET;
      assert.equal(isCronAuthorized(headers("Bearer shared-secret")), false);
      assert.equal(isTradingCronAuthorized(headers("Bearer trading-secret")), false);
    } finally {
      if (prevCron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevCron;
      if (prevTrading === undefined) delete process.env.TRADING_CRON_SECRET;
      else process.env.TRADING_CRON_SECRET = prevTrading;
    }
  });
});
