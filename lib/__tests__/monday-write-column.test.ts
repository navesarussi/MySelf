import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MondayGraphqlError } from "@/lib/integrations/task-sources/monday/graphql";
import { isMondayPermissionError } from "@/lib/integrations/task-sources/monday/write-column";

describe("isMondayPermissionError", () => {
  it("detects UserUnauthorizedException from extensions", () => {
    const err = new MondayGraphqlError(200, "body", [
      {
        message: "User unauthorized to perform action",
        extensions: { code: "UserUnauthorizedException", status_code: 403 },
      },
    ]);
    assert.equal(isMondayPermissionError(err), true);
  });

  it("returns false for label mismatch errors", () => {
    const err = new MondayGraphqlError(200, "body", [{ message: "Invalid column value" }]);
    assert.equal(isMondayPermissionError(err), false);
  });
});
