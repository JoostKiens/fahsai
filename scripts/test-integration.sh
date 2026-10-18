#!/usr/bin/env bash
# Starts a trimmed local Supabase (db, kong, postgrest, gotrue) and runs the backend integration
# tests against it. Needs Docker and the Supabase CLI. CI runs this same script.
#
# Leaves the stack running so the next run is fast; stop it with `supabase stop --no-backup`.
set -euo pipefail
cd "$(dirname "$0")/.."

# gotrue stays on: `supabase status` only prints the API keys while it runs.
# Retried because the image pull can hit anonymous rate limits on public.ecr.aws.
for attempt in 1 2 3; do
  supabase start -x realtime,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta,studio && break
  [ "$attempt" = 3 ] && exit 1
  sleep 15
done

# `supabase start` only applies migrations when it creates the database, so a stack left running
# from an earlier run would miss any migration added since. `migration up` is a no-op when current;
# it refuses when the database has migrations this checkout lacks (e.g. after switching branches),
# so rebuild from scratch then.
supabase migration up --local || supabase db reset --local

eval "$(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

pnpm --filter backend test:integration
