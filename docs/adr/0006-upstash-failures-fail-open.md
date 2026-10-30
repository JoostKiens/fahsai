# ADR 0006 — Upstash failures fail open

**Date:** 2026-05-28, extended on 2026-10-30
**Status:** Accepted

## Context

Upstash Redis backs three things in the API:

1. **Rate limiting** for `/api/explain`, which calls Gemini: 5 requests an hour per IP, and 20 a
   minute per IP for `/api/explain/context`.
2. **A global daily quota** of 450 explanations.
3. **The response cache** in front of Supabase ([ADR 0004](0004-backend-only-db-access-and-redis-cache-aside.md)).

Upstash can be unreachable, or stopped: the pay-as-you-go plan stops the database outright when it
hits its $20 monthly budget. The first version only failed open for the rate limiter. A Redis
error anywhere else returned a 5xx, so a stopped cache took the whole map down even though every
byte of data was still in Supabase. The Upstash client's default retries also held each request
for 10–14 seconds before failing.

## Decision

**When Upstash fails, the API keeps serving.**

- **Rate limiter and daily quota:** allow the request and log the error (`ipRateLimitResetMs`,
  `dailyQuotaCount` in `routes/explain.ts`). This is safe because Gemini is on Google's free tier
  with no billing account: extra calls during an outage cost nothing, and Gemini's own 429 still
  caps usage.
- **Cache:** every call goes through `cache/safe.ts` (`cacheGet`, `cacheSet`, `cacheReplace`,
  `cacheDel`). A failed read is a miss and the route reads Supabase; a failed write is skipped.
- **Fast failure:** the client makes one attempt with a 2-second timeout, and no retries
  (`cache/client.ts`).
- **Ingest jobs** don't fail when the cache step fails after a successful database write. If they
  can't overwrite a cached value, they delete it instead so the route rebuilds it from Supabase
  (logged only). If the delete fails too, they report it to Rollbar, because the outdated value
  could otherwise be served for up to 7 days.

## Alternatives considered

- **Fail closed (return 503).** It protects the downstream service the cache or limiter guards.
  Here that service is free (Gemini) or the source of truth (Supabase), so failing closed would
  only turn a cache problem into an outage.
- **Retry with backoff.** That was the Upstash client default. It turned a Redis outage into 10–14
  second responses on every request.

## Consequences

- A Redis outage makes the map slower (Supabase reads instead of cache hits), not broken. Measured
  with Redis unreachable: `/cams` 2.9 s instead of 14 s.
- **A stopped cache causes no visible errors, so it has to be monitored separately.** `/health`
  reports `cache: "error"` with HTTP 200 (only a database outage returns 503), and the
  `pipeline-health` cron alerts on it.
- If Gemini billing is ever enabled, the quota must be revisited: failing open would then cost
  money during an outage.
- Code that awaits Redis directly instead of through `cache/safe.ts` brings back the old failure
  mode. The helpers and their tests are the place to change cache behaviour.
