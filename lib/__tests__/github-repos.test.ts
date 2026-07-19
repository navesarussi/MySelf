import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupGithubReposByOwner,
  toGithubRepoListItem,
} from "../integrations/task-sources/github/repos";

describe("groupGithubReposByOwner", () => {
  it("groups and sorts by owner then repo name", () => {
    const groups = groupGithubReposByOwner([
      toGithubRepoListItem("zeta/app")!,
      toGithubRepoListItem("acme/zebra")!,
      toGithubRepoListItem("acme/alpha")!,
    ]);
    assert.deepEqual(
      groups.map((g) => ({ owner: g.owner, names: g.repos.map((r) => r.name) })),
      [
        { owner: "acme", names: ["alpha", "zebra"] },
        { owner: "zeta", names: ["app"] },
      ]
    );
  });
});
