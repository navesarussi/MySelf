import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeGithubExternalId, parseGithubExternalId } from "../integrations/task-sources/github/ids";
import { mapGithubIssue } from "../integrations/task-sources/github/map";

describe("github ids", () => {
  it("round-trips owner/repo#number", () => {
    const id = makeGithubExternalId("acme/app", 42);
    assert.equal(id, "acme/app#42");
    assert.deepEqual(parseGithubExternalId(id), { owner: "acme", repo: "app", number: 42 });
  });
});

describe("mapGithubIssue", () => {
  it("maps assigned issue and skips PRs", () => {
    const draft = mapGithubIssue({
      number: 7,
      title: "Fix login",
      body: "details",
      html_url: "https://github.com/acme/app/issues/7",
      repository: { full_name: "acme/app" },
      milestone: { due_on: "2026-08-01T00:00:00Z" },
    });
    assert.equal(draft?.externalId, "acme/app#7");
    assert.equal(draft?.externalListId, "acme/app");
    assert.equal(draft?.dueDate, "2026-08-01");
    assert.equal(mapGithubIssue({
      number: 1,
      title: "PR",
      body: null,
      html_url: "https://github.com/acme/app/pull/1",
      pull_request: {},
      repository: { full_name: "acme/app" },
    }), null);
  });
});
