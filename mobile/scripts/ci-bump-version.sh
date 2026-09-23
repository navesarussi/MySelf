#!/usr/bin/env bash
# Bump patch version in mobile + root package.json and app.json (no commit).
#
# The base is the HIGHER of the two package.json versions, not mobile's.
# CLAUDE.md requires the root version to be bumped on every deploy to main and
# the app displays it under the site title, so feature PRs move the root while
# only this script moves mobile. Bumping from mobile alone then wrote its lower
# number over the root — the displayed version went backwards after every
# TestFlight build (root 1.31.3 → 1.27.22), and the same string could ship twice.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"

node <<NODE
const fs = require('fs');
const rootPath = '$ROOT/package.json';
const mobilePath = '$MOBILE/package.json';
const appPath = '$MOBILE/app.json';

const parse = (v) => String(v || '0.0.0').split('.').map((n) => Number(n) || 0);
/** Numeric semver compare — "1.9.0" sorts above "1.10.0" as a string. */
const cmp = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

const rootJson = JSON.parse(fs.readFileSync(rootPath, 'utf8'));
const mobileJson = JSON.parse(fs.readFileSync(mobilePath, 'utf8'));
const current = cmp(rootJson.version, mobileJson.version) >= 0 ? rootJson.version : mobileJson.version;

const [major, minor, patch] = parse(current);
const next = \`\${major}.\${minor}.\${patch + 1}\`;

const wasRoot = rootJson.version;
const wasMobile = mobileJson.version;
rootJson.version = next;
mobileJson.version = next;
fs.writeFileSync(rootPath, JSON.stringify(rootJson, null, 2) + '\n');
fs.writeFileSync(mobilePath, JSON.stringify(mobileJson, null, 2) + '\n');

const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
app.expo.version = next;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');

console.log(\`Bumped version: \${current} → \${next} (root was \${wasRoot}, mobile was \${wasMobile})\`);
NODE
