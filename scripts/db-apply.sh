#!/usr/bin/env bash
# Apply all myself schema migrations to the linked Supabase project.
# Migrations are idempotent (IF NOT EXISTS / guarded inserts).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

echo "Applying migrations to linked Supabase project..."
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  supabase db query --linked -f "$f" --agent no
done

echo "Reloading PostgREST schema cache..."
supabase db query --linked "NOTIFY pgrst, 'reload schema';" --agent no

echo "Done."
