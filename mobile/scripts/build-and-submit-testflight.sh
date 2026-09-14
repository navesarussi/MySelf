#!/usr/bin/env bash
# Local iOS build + TestFlight submit (no EAS cloud build quota).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f asc-api-key.p8 ]]; then
  echo "Missing mobile/asc-api-key.p8 (symlink or copy AuthKey_X3N8885G95.p8)" >&2
  exit 1
fi

npm ci

if [[ -f asc-api-key.p8 ]]; then
  echo "Syncing EAS iOS buildNumber with latest VALID ASC build..."
  node scripts/sync-eas-ios-build-number.mjs || true
fi

EXPECTED_BUILD="$(node -e "
const {execSync}=require('child_process');
const v=execSync('npx eas-cli build:version:get -p ios',{encoding:'utf8'}).match(/buildNumber\\s*-\\s*(\\d+)/i);
console.log(v?Number(v[1])+1:54);
")"

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

echo "Verifying build appeared in App Store Connect (>= ${EXPECTED_BUILD})..."
node scripts/asc-poll-build.mjs "${EXPECTED_BUILD}"

echo "Done — check TestFlight in App Store Connect."
