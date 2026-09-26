#!/usr/bin/env tsx
/**
 * Fail when tracked package/app/json/ts files contain merge conflict markers.
 * Used by .github/workflows/verify.yml.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isConflictMarkerScanPath, scanFilesForConflictMarkers } from "../../lib/ci/conflict-markers";

const tracked = execSync("git ls-files", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => f && isConflictMarkerScanPath(f));

const files = tracked.map((path) => ({ path, content: readFileSync(path, "utf8") }));
const violations = scanFilesForConflictMarkers(files);

if (violations.length === 0) {
  console.log(`OK: scanned ${tracked.length} files — no conflict markers`);
  process.exit(0);
}

for (const v of violations) {
  console.error(`ERROR: conflict marker in ${v.path} (lines ${v.lines.join(", ")})`);
}
process.exit(1);
