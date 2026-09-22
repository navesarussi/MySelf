#!/usr/bin/env bash
# Export EXPO_ASC_* env vars so EAS can create/repair iOS provisioning profiles in CI.
# Requires ci-write-asc-key.sh to have run first (asc-api-key.p8 on disk).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
key_path="${root}/asc-api-key.p8"

if [[ ! -f "$key_path" ]]; then
  echo "Missing $key_path — run scripts/ci-write-asc-key.sh first" >&2
  exit 1
fi

: "${ASC_API_KEY_ID:?ASC_API_KEY_ID is not set}"
: "${ASC_API_KEY_ISSUER_ID:?ASC_API_KEY_ISSUER_ID is not set}"

export EXPO_ASC_API_KEY_PATH="$key_path"
export EXPO_ASC_KEY_ID="$ASC_API_KEY_ID"
export EXPO_ASC_ISSUER_ID="$ASC_API_KEY_ISSUER_ID"
export EXPO_APPLE_TEAM_ID="${EXPO_APPLE_TEAM_ID:-HVW3H3DLRB}"
export EXPO_APPLE_TEAM_TYPE="${EXPO_APPLE_TEAM_TYPE:-COMPANY_OR_ORGANIZATION}"

echo "Exported EXPO_ASC_* env for Apple Team ${EXPO_APPLE_TEAM_ID} (key ${EXPO_ASC_KEY_ID})"
