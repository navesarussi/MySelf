#!/usr/bin/env tsx
/**
 * CLI wrapper for Vercel ignoreCommand (called from scripts/ci/vercel-should-build.sh).
 * Vercel's Ignored Build Step: exit 0 → SKIP the build ("ignored"), exit 1 → build.
 * (It was inverted: every commit that needed a deploy was canceled, only skippable ones built.)
 */
import { shouldBuildVercel } from "../../lib/ci/vercel-should-build";

const filesRaw = process.env.VERCEL_SHOULD_BUILD_FILES?.trim() ?? "";
const changedFiles = filesRaw ? filesRaw.split("\n").filter(Boolean) : [];

const { build, reason } = shouldBuildVercel({
  branch: process.env.VERCEL_SHOULD_BUILD_BRANCH ?? "",
  commitMessage: process.env.VERCEL_SHOULD_BUILD_MESSAGE ?? "",
  changedFiles,
});

console.log(build ? `build: ${reason}` : `skip: ${reason}`);
process.exit(build ? 1 : 0);
