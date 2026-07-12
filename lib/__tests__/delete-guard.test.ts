import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDeleteProject } from "../projects/delete-guard";

describe("canDeleteProject", () => {
  it("allows delete when no tasks or relationships", () => {
    assert.equal(canDeleteProject(0, 0), "ok");
  });

  it("blocks delete when tasks exist", () => {
    assert.equal(canDeleteProject(1, 0), "blocked");
  });

  it("blocks delete when relationships exist", () => {
    assert.equal(canDeleteProject(0, 3), "blocked");
  });

  it("blocks delete when both exist", () => {
    assert.equal(canDeleteProject(2, 1), "blocked");
  });
});
