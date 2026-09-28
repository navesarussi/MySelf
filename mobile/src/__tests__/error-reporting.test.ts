import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSkipClientReport } from "../error-reporting/skip-report";

describe("mobile error-reporting skip list", () => {
  it("skips no_price ApiErrors from live price polling", () => {
    assert.equal(
      shouldSkipClientReport({ message: "no_price", httpStatus: 503 }),
      true
    );
  });

  it("still reports unexpected API failures", () => {
    assert.equal(shouldSkipClientReport({ message: "db_error", httpStatus: 500 }), false);
  });
});
