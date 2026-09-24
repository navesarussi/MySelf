import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mintOAuthState, oauthStateAccount } from "../integrations/oauth-state-token";
import { mintScopedToken } from "../auth";

describe("OAuth state token", () => {
  before(() => {
    process.env.AUTH_SECRET = "test-secret";
  });

  it("names the account that started the connect", async () => {
    const state = await mintOAuthState("Someone@Example.com");
    assert.equal(await oauthStateAccount(state), "someone@example.com");
  });

  it("expires after ten minutes", async () => {
    const now = Date.now();
    const state = await mintOAuthState("a@example.com", now);
    assert.equal(await oauthStateAccount(state, now + 11 * 60 * 1000), null);
  });

  it("rejects a token minted for another purpose", async () => {
    const other = await mintScopedToken("test-secret", "oauth-start", "a@example.com");
    assert.equal(await oauthStateAccount(other), null);
  });

  it("rejects a tampered token", async () => {
    const state = await mintOAuthState("a@example.com");
    const [v, , sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "b@example.com", iat: 1, exp: 9e9, aud: "oauth-state" }))
      .toString("base64url");
    assert.equal(await oauthStateAccount(`${v}.${forged}.${sig}`), null);
    assert.equal(await oauthStateAccount("random-hex-state"), null);
  });
});
