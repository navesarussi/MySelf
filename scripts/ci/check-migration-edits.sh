#!/usr/bin/env bash
# Fail when a PR changes or removes a migration that is already on the base branch.
#
# db-migrate.ts applies each file once and records it in a ledger, so editing a
# merged migration never reaches the database: the file and the schema drift
# apart silently (0048 was edited after it had been applied, 2026-09-26).
# Schema changes go in a new migration. If a merged migration genuinely never
# ran anywhere, label the PR `migration-edit-ok`.
#
# Usage: BASE_REF=main [LABELS='["..."]'] scripts/ci/check-migration-edits.sh
set -euo pipefail

: "${BASE_REF:?BASE_REF is required}"
if [[ "${LABELS:-}" == *migration-edit-ok* ]]; then
  echo "migration-edit-ok label set; skipping."
  exit 0
fi

changed="$(git diff --name-status --no-renames "origin/$BASE_REF...HEAD" -- supabase/migrations | awk '$1 != "A" { print $2 }')"
if [[ -n "$changed" ]]; then
  while IFS= read -r f; do
    echo "::error file=$f::Merged migrations are append-only. Add a new migration instead of editing $f."
  done <<< "$changed"
  exit 1
fi
echo "✓ no merged migration changed"
