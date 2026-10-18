#!/usr/bin/env bash
# Starts a trimmed local Supabase (db, kong, postgrest, gotrue) and runs the backend integration
# tests against it. Needs Docker and the Supabase CLI. CI runs this same script.
#
# Leaves the stack running so the next run is fast; stop it with `supabase stop --no-backup`.
set -euo pipefail
cd "$(dirname "$0")/.."

# gotrue stays on: `supabase status` only prints the API keys while it runs.
supabase start -x realtime,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta,studio

eval "$(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

pnpm --filter backend test:integration
