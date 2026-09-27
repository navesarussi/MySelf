/**
 * Vercel ignoreCommand logic (see vercel.json + scripts/ci/vercel-should-build.sh).
 *
 * Vercel exit semantics (handled by the CLI wrapper): 0 = skip the build, 1 = build.
 */

export type ShouldBuildInput = {
  branch: string;
  commitMessage: string;
  changedFiles: string[];
  /** When true and changedFiles is empty, prefer building (safe default). */
  conservativeWhenUnknown?: boolean;
};

/**
 * Paths that do not require a Vercel production rebuild on their own.
 * NOT `mobile/`: the web app at the domain root is the Expo web export of mobile/ (scripts/export-expo-web.sh).
 */
export function isSkippableDeployPath(file: string): boolean {
  if (file.startsWith("docs/")) return true;
  if (file.startsWith(".github/")) return true;
  if (file.includes("/__tests__/")) return true;
  if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) return true;
  return false;
}

export function shouldBuildVercel(input: ShouldBuildInput): { build: boolean; reason: string } {
  const conservative = input.conservativeWhenUnknown !== false;

  if (input.branch && input.branch !== "main") {
    return { build: false, reason: `branch ${input.branch} is not main` };
  }

  // No "[skip ci]" shortcut: the TestFlight bot pushes one right after every merge, Vercel cancels the
  // merge's production build in favour of the newer commit, and skipping that commit left production on old
  // code (2026-09-27: #103, #114 and #115 never deployed). Its diff (package.json version) decides instead.

  if (input.changedFiles.length === 0) {
    return conservative
      ? { build: true, reason: "no changed files listed — building conservatively" }
      : { build: false, reason: "no changed files" };
  }

  const deployTrigger = input.changedFiles.find((f) => !isSkippableDeployPath(f));
  if (!deployTrigger) {
    return {
      build: false,
      reason: `only mobile/docs/ci/tests changed (${input.changedFiles.length} files)`,
    };
  }

  return { build: true, reason: `${deployTrigger} requires deploy` };
}
