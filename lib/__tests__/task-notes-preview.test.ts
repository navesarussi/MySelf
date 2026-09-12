import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NOTES_PREVIEW_CHARS, previewNotes, projectNameFromJoin } from "../api/tasks";

describe("previewNotes", () => {
  it("passes through a note that already fits", () => {
    const result = previewNotes("short note");
    assert.equal(result.notes, "short note");
    assert.equal(result.truncated, false);
  });

  it("treats an exactly-at-limit note as complete", () => {
    const exact = "x".repeat(NOTES_PREVIEW_CHARS);
    const result = previewNotes(exact);
    assert.equal(result.notes, exact);
    assert.equal(result.truncated, false, "no detail fetch should be needed");
  });

  it("truncates one character over the limit and flags it", () => {
    const long = "x".repeat(NOTES_PREVIEW_CHARS + 1);
    const result = previewNotes(long);
    assert.equal(result.notes?.length, NOTES_PREVIEW_CHARS);
    assert.equal(result.truncated, true);
  });

  it("keeps null and empty notes untruncated", () => {
    assert.deepEqual(previewNotes(null), { notes: null, truncated: false });
    assert.deepEqual(previewNotes(undefined), { notes: null, truncated: false });
    assert.deepEqual(previewNotes(""), { notes: "", truncated: false });
  });
});

describe("projectNameFromJoin", () => {
  it("reads the name from an object join", () => {
    assert.equal(projectNameFromJoin({ name: "Roadmap" }), "Roadmap");
  });

  it("reads the first name from an array join", () => {
    assert.equal(projectNameFromJoin([{ name: "Roadmap" }]), "Roadmap");
  });

  it("returns undefined for null or empty joins", () => {
    assert.equal(projectNameFromJoin(null), undefined);
    assert.equal(projectNameFromJoin([]), undefined);
  });
});
