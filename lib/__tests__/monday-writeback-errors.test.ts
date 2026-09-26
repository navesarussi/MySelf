import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MondayGraphqlError } from "@/lib/integrations/task-sources/monday/graphql";
import { classifyWritebackError } from "@/lib/integrations/task-sources/writeback-errors";

describe("classifyWritebackError Monday GraphQL", () => {
  it("treats item not found as local-only allowed", () => {
    const err = new MondayGraphqlError(200, '{"errors":[{"message":"Item not found"}]}', [
      { message: "Item not found" },
    ]);
    const classified = classifyWritebackError(err);
    assert.equal(classified.code, "monday_item_not_found");
    assert.equal(classified.localOnlyAllowed, true);
    assert.match(classified.userMessageHe ?? "", /Monday/);
  });

  it("treats permission errors as local-only allowed", () => {
    const err = new MondayGraphqlError(403, "forbidden", [{ message: "Not authorized" }]);
    const classified = classifyWritebackError(err);
    assert.equal(classified.code, "monday_permission_denied");
    assert.equal(classified.localOnlyAllowed, true);
  });

  it("classifies User unauthorized to perform action", () => {
    const err = new MondayGraphqlError(403, "forbidden", [
      { message: "User unauthorized to perform action" },
    ]);
    const classified = classifyWritebackError(err);
    assert.equal(classified.code, "monday_permission_denied");
    assert.equal(classified.localOnlyAllowed, true);
  });

  it("classifies UserUnauthorizedException via GraphQL extensions", () => {
    const err = new MondayGraphqlError(200, "body", [
      {
        message: "User unauthorized to perform action",
        extensions: { code: "UserUnauthorizedException", status_code: 403 },
      },
    ]);
    const classified = classifyWritebackError(err);
    assert.equal(classified.code, "monday_permission_denied");
    assert.equal(classified.localOnlyAllowed, true);
  });

  it("classifies missing write scope as integration auth", () => {
    const classified = classifyWritebackError(new Error("monday_missing_write_scope"));
    assert.equal(classified.code, "integration_auth_failed");
    assert.match(classified.userMessageHe ?? "", /Monday/);
  });

  it("treats label mismatch as local-only allowed", () => {
    const err = new MondayGraphqlError(200, "body", [
      { message: "Invalid column value for status column" },
    ]);
    const classified = classifyWritebackError(err);
    assert.equal(classified.localOnlyAllowed, true);
  });
});
