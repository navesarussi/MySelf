#!/usr/bin/env bash
# Replay every migration, in filename order, on an empty Postgres.
#
# Migrations only met a database after merging to main (db-apply.yml), while
# the code that needs them was already deploying. On 2026-09-26 0048 used table
# names without the `myself.` schema, failed in db-apply, and production ran
# code against a schema that did not exist yet until a fix landed. Replaying
# from scratch in CI catches that class of failure before merge.
#
# Each file runs as one transaction, as the Management API applies it in
# db-migrate.ts. The database gets the roles Supabase provides (anon,
# authenticated, service_role), which the migrations grant to and revoke from.
#
# Usage: DATABASE_URL=postgres://... scripts/ci/check-migrations.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
DIR="$(cd "$(dirname "$0")/../../supabase/migrations" && pwd)"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
SQL

# Data-only fixes that reference production rows (a project id, say), so they
# cannot run on an empty database. Schema migrations never belong here.
PROD_DATA_ONLY=(
  0021b_fix_relationship_cards.sql # re-inserts relationship cards into a production project
)

count=0
skipped=0
for file in "$DIR"/*.sql; do
  name="$(basename "$file")"
  if [[ " ${PROD_DATA_ONLY[*]} " == *" $name "* ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  if ! out="$("${PSQL[@]}" --single-transaction -f "$file" 2>&1)"; then
    echo "::error file=supabase/migrations/$name::Migration failed on a fresh database"
    echo "✗ $name"
    echo "$out"
    exit 1
  fi
  count=$((count + 1))
done
echo "✓ replayed $count migrations on a fresh database ($skipped production-data fix skipped)"
