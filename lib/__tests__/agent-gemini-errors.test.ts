import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_CREDITS_DEPLETED, mapGeminiError } from "../agent/gemini-errors";

describe("mapGeminiError", () => {
  it("maps prepayment depleted to stable code", () => {
    const err = mapGeminiError(new Error("prepayment credits are depleted"));
    assert.equal(err.message, GEMINI_CREDITS_DEPLETED);
  });

  it("maps HTTP 402 billing errors", () => {
    const raw = Object.assign(new Error("Payment Required"), {
      statusCode: 402,
      responseBody: "billing",
    });
    assert.equal(mapGeminiError(raw).message, GEMINI_CREDITS_DEPLETED);
  });

  it("preserves other errors", () => {
    const err = mapGeminiError(new Error("network timeout"));
    assert.equal(err.message, "network timeout");
  });
});
