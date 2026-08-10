#!/usr/bin/env bash
# Apply migrations (+ optional seed) to a Supabase cloud project over HTTPS via
# the Management API — used when direct Postgres ports are firewalled.
# Env: SBP (personal access token), REF (project ref). Args: files to apply.
set -euo pipefail
: "${SBP:?set SBP}"; : "${REF:?set REF}"
API="https://api.supabase.com/v1/projects/${REF}/database/query"

apply() {
  local file="$1"
  local body http
  body=$(jq -Rs '{query: .}' < "$file")
  http=$(curl -s -o /tmp/mgmt_resp.json -w "%{http_code}" -X POST "$API" \
    -H "Authorization: Bearer ${SBP}" -H "Content-Type: application/json" \
    --data "$body")
  if [[ "$http" == 2* ]]; then
    echo "  ✓ $(basename "$file")"
  else
    echo "  ✗ $(basename "$file")  (http=$http)"
    echo "    $(head -c 400 /tmp/mgmt_resp.json)"
    exit 1
  fi
}

for f in "$@"; do apply "$f"; done
echo "done."
