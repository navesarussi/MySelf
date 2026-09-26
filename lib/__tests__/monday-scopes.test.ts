import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mondayScopeIncludesWrite } from "@/lib/integrations/task-sources/monday/scopes";

describe("mondayScopeIncludesWrite", () => {
  it("requires boards:write when scope is known", () => {
    assert.equal(mondayScopeIncludesWrite("me:read boards:read boards:write"), true);
    assert.equal(mondayScopeIncludesWrite("me:read boards:read"), false);
  });

  it("allows write when scope was not persisted (legacy tokens)", () => {
    assert.equal(mondayScopeIncludesWrite(undefined), true);
    assert.equal(mondayScopeIncludesWrite(""), true);
  });
});
