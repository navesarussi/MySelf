import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execRun } from "../ci/exec-run";

describe("execRun", () => {
  it("returns trimmed stdout when stdio is piped", () => {
    const out = execRun("node", ["-e", "process.stdout.write('  hi\\n')"]);
    assert.equal(out, "hi");
  });

  it("returns empty string when stdio is inherit (execFileSync returns null)", () => {
    const out = execRun("node", ["-e", ""], { inherit: true });
    assert.equal(out, "");
  });
});
