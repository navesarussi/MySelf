#!/usr/bin/env bash
# Vercel ignoreCommand — exit 0 to build, exit 1 to skip.
# https://vercel.com/docs/project-configuration#ignorecommand
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BRANCH="${VERCEL_GIT_COMMIT_REF:-}"
MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"
PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CURR="${VERCEL_GIT_COMMIT_SHA:-}"

FILES=""
if [[ -n "$PREV" && -n "$CURR" ]]; then
  FILES="$(git diff --name-only "$PREV" "$CURR" 2>/dev/null || true)"
fi

export VERCEL_SHOULD_BUILD_BRANCH="$BRANCH"
export VERCEL_SHOULD_BUILD_MESSAGE="$MSG"
export VERCEL_SHOULD_BUILD_FILES="$FILES"

node --import tsx "$ROOT/scripts/ci/vercel-should-build.ts"
