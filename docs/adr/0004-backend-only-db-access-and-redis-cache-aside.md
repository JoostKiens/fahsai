# ADR 0004 — All database access through the backend, with a Redis cache-aside layer

**Date:** 2026-05-09 (written up retroactively on 2026-10-30)
**Status:** Accepted

## Context

Supabase lets a browser query Postgres directly with its public `anon` key, with row-level security
(RLS) policies deciding what each request may read. Fahsai's data is public, so that would have
worked. But the map requests the same large, immutable payloads on every visit: a day's CAMS
PM2.5 grid is about 4,600 points, the wind grid about the same, and fires and station readings
come on top. Several of these need processing (bbox filtering, deduplication, joining station
metadata) that's awkward to express as a single PostgREST query.

## Decision

1. **The browser never talks to Supabase.** All reads and writes go through the Fastify API on
   Railway, which uses the Supabase **service-role key**. RLS is enabled on every table with **no
   policies**, so the `anon` key can read nothing even if someone finds the project URL. Legacy
   migration 006 enabled it on the original tables; since then an event trigger in the baseline
   schema (`rls_auto_enable`) enables it on every new table in `public`. Keep that trigger in any
   future baseline.
2. **Redis (Upstash) is a cache-aside layer in front of Supabase.** A route reads its key from
   Redis. On a miss it queries Supabase, then writes the result back with a 7-day TTL. This works
   because almost everything the map shows is historical and immutable once ingested. Ingest jobs
   either warm a key with the exact value the route serves (CAMS, weather) or delete it so the
   route rebuilds it (fires, station readings).
3. **Redis is only a cache.** Every cache read and write goes through `cache/safe.ts`, which never
   throws: a failed read is a miss, a failed write is skipped. The rate limiters, the daily quota
   and `/health` call Redis directly, each with its own fail-open `try/catch`. See
   [ADR 0006](0006-upstash-failures-fail-open.md).

## Alternatives considered

- **Browser → Supabase with `anon` key + RLS read policies.** Less code, but it pushes processing
  into the client, exposes the schema as a public API, and gives no place to cache processed
  responses. Every visitor would hit Postgres.
- **HTTP caching only (CDN), no Redis.** Responses for historical days already carry a 7-day
  `Cache-Control: public, max-age=604800`, but a CDN miss would still hit Postgres. Redis gives a shared, warmable cache
  in front of the free-tier database.

## Consequences

- One trust boundary: only the backend holds a database credential, and the frontend gets nothing
  it could misuse.
- **The service-role key bypasses RLS entirely**, so a leaked backend key is a full read/write
  breach. It's a Railway secret, never sent to the frontend, and was rotated on 2026-10-27. JOO-79
  (optional) proposes a least-privilege role for the read-only routes.
- Cached data can be stale after an ingest re-runs, for up to the TTL, if the invalidation fails.
  Ingest jobs report a failed invalidation to Rollbar so the key can be deleted by hand.
- Two services to run instead of one, but Upstash is pay-as-you-go with a $20 budget cap, at about
  $0.02 a month today (see `docs/claude/costs.md`).
