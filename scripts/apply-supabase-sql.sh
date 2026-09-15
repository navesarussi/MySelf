#!/usr/bin/env bash
# Run idempotent SQL on Supabase project via Management API (needs SUPABASE_ACCESS_TOKEN).
set -euo pipefail
cd "$(dirname "$0")/.."

REF="${SUPABASE_PROJECT_REF:-roeefqpdbftlndzsvhfj}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set."
  echo "Create one at https://supabase.com/dashboard/account/tokens (Database Write on project $REF)."
  exit 1
fi

SQL_FILE="${1:-supabase/migrations/0035_agent_whatsapp_dedup.sql}"
if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: SQL file not found: $SQL_FILE"
  exit 1
fi

QUERY="$(cat "$SQL_FILE")"
QUERY="$QUERY
NOTIFY pgrst, 'reload schema';"

payload=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' <<< "$QUERY")

echo "→ Applying $SQL_FILE on project $REF ..."
http_code=$(curl -sS -o /tmp/supabase-sql-response.json -w "%{http_code}" \
  -X POST "https://api.supabase.com/v1/projects/${REF}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload")

cat /tmp/supabase-sql-response.json
echo ""
if [ "$http_code" != "201" ] && [ "$http_code" != "200" ]; then
  echo "ERROR: HTTP $http_code"
  exit 1
fi
echo "Done."
