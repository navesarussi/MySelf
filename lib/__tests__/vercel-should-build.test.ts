import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSkippableDeployPath, shouldBuildVercel } from "../ci/vercel-should-build";

describe("isSkippableDeployPath", () => {
  it("treats mobile, docs, ci, and tests as skippable", () => {
    assert.equal(isSkippableDeployPath("mobile/app.json"), true);
    assert.equal(isSkippableDeployPath("docs/SSOT/SRS.md"), true);
    assert.equal(isSkippableDeployPath(".github/workflows/verify.yml"), true);
    assert.equal(isSkippableDeployPath("lib/__tests__/home.test.ts"), true);
    assert.equal(isSkippableDeployPath("lib/foo.test.ts"), true);
  });

  it("requires deploy for server and web paths", () => {
    assert.equal(isSkippableDeployPath("app/api/v1/home/route.ts"), false);
    assert.equal(isSkippableDeployPath("lib/ops/smoke.ts"), false);
    assert.equal(isSkippableDeployPath("vercel.json"), false);
    assert.equal(isSkippableDeployPath("package.json"), false);
  });
});

describe("shouldBuildVercel", () => {
  it("skips non-main branches", () => {
    const r = shouldBuildVercel({
      branch: "cursor/foo-b671",
      commitMessage: "feat",
      changedFiles: ["app/page.tsx"],
    });
    assert.equal(r.build, false);
  });

  it("skips [skip ci] version bumps on main", () => {
    const r = shouldBuildVercel({
      branch: "main",
      commitMessage: "chore(mobile): bump version for TestFlight [skip ci]",
      changedFiles: ["package.json", "mobile/app.json"],
    });
    assert.equal(r.build, false);
  });

  it("skips main commits that only touch mobile and ci", () => {
    const r = shouldBuildVercel({
      branch: "main",
      commitMessage: "feat(mobile): OTA",
      changedFiles: ["mobile/app/_layout.tsx", ".github/workflows/eas-update.yml"],
    });
    assert.equal(r.build, false);
  });

  it("builds when server code changes on main", () => {
    const r = shouldBuildVercel({
      branch: "main",
      commitMessage: "fix(api): home trading",
      changedFiles: ["mobile/app.json", "app/api/v1/home/route.ts"],
    });
    assert.equal(r.build, true);
  });

  it("builds conservatively when changed files are unknown", () => {
    const r = shouldBuildVercel({
      branch: "main",
      commitMessage: "fix",
      changedFiles: [],
    });
    assert.equal(r.build, true);
  });
});
