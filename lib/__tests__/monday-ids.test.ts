import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeMondayExternalId,
  parseMondayExternalId,
} from "../integrations/task-sources/monday/ids";

describe("monday ids", () => {
  it("round-trips account and item", () => {
    const id = makeMondayExternalId("acc1", "item99");
    assert.equal(id, "acc1:item99");
    assert.deepEqual(parseMondayExternalId(id), {
      accountKey: "acc1",
      itemId: "item99",
    });
  });

  it("rejects invalid ids", () => {
    assert.throws(() => parseMondayExternalId("nocolon"), /invalid_monday_external_id/);
    assert.throws(() => parseMondayExternalId(":item"), /invalid_monday_external_id/);
    assert.throws(() => parseMondayExternalId("acc:"), /invalid_monday_external_id/);
  });
});
