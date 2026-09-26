/**
 * Vercel ignoreCommand logic (see vercel.json + scripts/ci/vercel-should-build.sh).
 *
 * Exit semantics for the shell wrapper: 0 = build, 1 = skip.
 */

export type ShouldBuildInput = {
  branch: string;
  commitMessage: string;
  changedFiles: string[];
  /** When true and changedFiles is empty, prefer building (safe default). */
  conservativeWhenUnknown?: boolean;
};

/** Paths that do not require a Vercel production rebuild on their own. */
export function isSkippableDeployPath(file: string): boolean {
  if (file.startsWith("mobile/")) return true;
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

  if (/\[skip ci\]/i.test(input.commitMessage)) {
    return { build: false, reason: "[skip ci] commit" };
  }

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
