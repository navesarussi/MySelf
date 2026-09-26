#!/usr/bin/env tsx
/**
 * CLI wrapper for Vercel ignoreCommand (called from scripts/ci/vercel-should-build.sh).
 * Exit 0 → build; exit 1 → skip.
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
process.exit(build ? 0 : 1);
