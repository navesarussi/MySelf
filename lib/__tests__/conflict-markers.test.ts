import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isConflictMarkerScanPath,
  linesWithConflictMarkers,
  scanFilesForConflictMarkers,
} from "../ci/conflict-markers";

describe("conflict marker guard", () => {
  it("scans package.json and ts/tsx only", () => {
    assert.equal(isConflictMarkerScanPath("package.json"), true);
    assert.equal(isConflictMarkerScanPath("mobile/app.json"), true);
    assert.equal(isConflictMarkerScanPath("lib/foo.ts"), true);
    assert.equal(isConflictMarkerScanPath("README.md"), false);
  });

  it("detects standard conflict markers", () => {
    const content = `{
  "version": "2.7.0"
<<<<<<< HEAD
  "name": "ours"
=======
  "name": "theirs"
>>>>>>> branch
}`;
    assert.deepEqual(linesWithConflictMarkers(content), [3, 5, 7]);
  });

  it("passes clean files", () => {
    const violations = scanFilesForConflictMarkers([
      { path: "package.json", content: '{ "version": "2.7.10" }\n' },
      { path: "app/page.tsx", content: "export default function Page() { return null; }\n" },
    ]);
    assert.equal(violations.length, 0);
  });
});
