import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSkipClientReport } from "../error-reporting/noise";

describe("client error reporting noise filter", () => {
  it("skips no_price from live price polling", () => {
    assert.equal(shouldSkipClientReport({ message: "no_price", httpStatus: 503, route: "/trading/price" }), true);
  });

  it("keeps unexpected API failures reportable", () => {
    assert.equal(shouldSkipClientReport({ message: "db_error", httpStatus: 500 }), false);
  });
});
