#!/usr/bin/env bash
# Write App Store Connect API key from env (CI) to a local path for eas submit.
set -euo pipefail

out="$(cd "$(dirname "$0")/.." && pwd)/asc-api-key.p8"
if [[ -z "${ASC_API_KEY_P8:-}" ]]; then
  echo "ASC_API_KEY_P8 is not set" >&2
  exit 1
fi
printf '%s' "$ASC_API_KEY_P8" > "$out"
chmod 600 "$out"
echo "Wrote ASC API key to $out"
