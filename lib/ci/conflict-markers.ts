/**
 * Detect unresolved git merge conflict markers in tracked source files.
 */

export const CONFLICT_MARKER = /^<<<<<<< |^>>>>>>> |^=======$/;

/** File paths that must never ship with conflict markers. */
export function isConflictMarkerScanPath(file: string): boolean {
  if (file === "package.json" || file === "mobile/package.json" || file === "mobile/app.json") {
    return true;
  }
  if (file.endsWith(".ts") || file.endsWith(".tsx")) return true;
  return false;
}

export function linesWithConflictMarkers(content: string): number[] {
  const hits: number[] = [];
  content.split("\n").forEach((line, i) => {
    if (CONFLICT_MARKER.test(line)) hits.push(i + 1);
  });
  return hits;
}

export function scanFilesForConflictMarkers(
  files: { path: string; content: string }[]
): { path: string; lines: number[] }[] {
  const violations: { path: string; lines: number[] }[] = [];
  for (const { path, content } of files) {
    if (!isConflictMarkerScanPath(path)) continue;
    const lines = linesWithConflictMarkers(content);
    if (lines.length > 0) violations.push({ path, lines });
  }
  return violations;
}
