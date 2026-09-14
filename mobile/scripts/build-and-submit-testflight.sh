#!/usr/bin/env bash
# Local iOS build + TestFlight submit (no EAS cloud build quota).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f asc-api-key.p8 ]]; then
  echo "Missing mobile/asc-api-key.p8 (symlink or copy AuthKey_X3N8885G95.p8)" >&2
  exit 1
fi

npm ci
npx eas-cli build \
  --platform ios \
  --profile production \
  --local \
  --non-interactive \
  --output ./build-myself.ipa

npx eas-cli submit \
  --platform ios \
  --profile production \
  --path ./build-myself.ipa \
  --non-interactive \
  --wait

echo "Done — check TestFlight in App Store Connect."
