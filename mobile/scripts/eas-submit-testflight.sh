#!/usr/bin/env bash
# Submit IPA to TestFlight without blocking on Expo's --wait GraphQL poll.
# asc-poll-build.mjs verifies the build landed in App Store Connect.
set -euo pipefail

IPA_PATH="${1:-./build-myself.ipa}"
MAX_ATTEMPTS="${EAS_SUBMIT_ATTEMPTS:-3}"
LOG_FILE="${TMPDIR:-/tmp}/eas-submit-$$.log"

submit_once() {
  eas submit \
    --platform ios \
    --profile production \
    --path "$IPA_PATH" \
    --non-interactive \
    2>&1 | tee "$LOG_FILE"
}

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  set +e
  submit_once
  exit_code=$?
  set -e

  if [ "$exit_code" -eq 0 ]; then
    echo "Submission scheduled (attempt ${attempt})."
    exit 0
  fi

  if grep -qE "https://expo.dev/.*/submissions/" "$LOG_FILE"; then
    echo "Submission was accepted by Expo despite exit ${exit_code}; continuing."
    exit 0
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "eas submit failed after ${MAX_ATTEMPTS} attempts." >&2
    exit "$exit_code"
  fi

  echo "eas submit attempt ${attempt} failed; retrying..."
  sleep $((attempt * 15))
  attempt=$((attempt + 1))
done
