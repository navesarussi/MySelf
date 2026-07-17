#!/usr/bin/env bash
# Export Expo web SPA into public/spa for Next.js middleware to serve at domain root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mobile"

if [ ! -d node_modules ]; then
  echo "Installing mobile dependencies…"
  npm ci
fi

echo "Exporting Expo web → public/spa"
rm -rf "$ROOT/public/spa"
npx expo export -p web --output-dir "$ROOT/public/spa"

# Expo emits absolute /_expo and /favicon paths; rewrite so they load from /spa/*
INDEX="$ROOT/public/spa/index.html"
if [ -f "$INDEX" ]; then
  sed -i.bak \
    -e 's|src="/_expo|src="/spa/_expo|g' \
    -e 's|href="/_expo|href="/spa/_expo|g' \
    -e 's|href="/favicon|href="/spa/favicon|g' \
    "$INDEX"
  rm -f "$INDEX.bak"
fi

echo "Expo web export done."
