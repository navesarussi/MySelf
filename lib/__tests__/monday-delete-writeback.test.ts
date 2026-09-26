import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MondayGraphqlError } from "@/lib/integrations/task-sources/monday/graphql";
import {
  classifyWritebackError,
  isExpectedMondayWritebackError,
  pickPreferredWritebackError,
  shouldSkipMondayArchiveFallback,
  WritebackError,
} from "@/lib/integrations/task-sources/writeback-errors";

describe("Monday delete writeback helpers", () => {
  it("classifies User unauthorized to perform action as permission denied", () => {
    const err = new MondayGraphqlError(403, "forbidden", [
      { message: "User unauthorized to perform action" },
    ]);
    const classified = classifyWritebackError(err);
    assert.equal(classified.code, "monday_permission_denied");
    assert.equal(classified.localOnlyAllowed, true);
  });

  it("skips archive fallback after unauthorized complete", () => {
    const err = new MondayGraphqlError(403, "forbidden", [
      { message: "User unauthorized to perform action" },
    ]);
    assert.equal(shouldSkipMondayArchiveFallback(err), true);
  });

  it("does not skip archive fallback for unexpected complete failures", () => {
    const err = new WritebackError("external_api_failed", "network timeout", false);
    assert.equal(shouldSkipMondayArchiveFallback(err), false);
  });

  it("prefers permission error when complete and archive both fail", () => {
    const completeErr = new MondayGraphqlError(403, "forbidden", [{ message: "Not authorized" }]);
    const archiveErr = new MondayGraphqlError(500, "server", [{ message: "Internal error" }]);
    const picked = pickPreferredWritebackError(completeErr, archiveErr);
    assert.equal(picked.code, "monday_permission_denied");
  });

  it("treats expected Monday permission errors as non-reportable", () => {
    const err = new MondayGraphqlError(403, "forbidden", [
      { message: "User unauthorized to perform action" },
    ]);
    assert.equal(isExpectedMondayWritebackError(err), true);
  });

  it("still reports unexpected Monday failures", () => {
    const err = new MondayGraphqlError(500, "server", [{ message: "Internal server error" }]);
    assert.equal(isExpectedMondayWritebackError(err), false);
  });
});
