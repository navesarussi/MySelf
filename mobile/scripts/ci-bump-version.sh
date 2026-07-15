#!/usr/bin/env bash
# Bump patch version in mobile + root package.json and app.json (no commit).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"

current="$(node -p "require('$MOBILE/package.json').version")"
IFS='.' read -r major minor patch <<< "$current"
new="${major}.${minor}.$((patch + 1))"

node <<NODE
const fs = require('fs');
const paths = [
  '$ROOT/package.json',
  '$MOBILE/package.json',
];
for (const p of paths) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = '$new';
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
const app = JSON.parse(fs.readFileSync('$MOBILE/app.json', 'utf8'));
app.expo.version = '$new';
fs.writeFileSync('$MOBILE/app.json', JSON.stringify(app, null, 2) + '\n');
NODE

echo "Bumped mobile version: $current → $new"
