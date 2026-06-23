# Conventions, gotchas, and constraints

## Wind direction convention — read this before touching any wind direction code

`WindVector.directionDeg` (and Open-Meteo's `winddirection_10m`) is always the direction
the wind is coming **FROM**, in meteorological convention (0° = from North, 90° = from East,
180° = from South, 270° = from West).

| Use case | Result | Example (directionDeg = 45, i.e. wind from NE) |
|---|---|---|
| **Display label** (InfoPanel, any UI text) | `windDir.fromLabel` | "from NE" |
| **Particle / arrow travel direction** | `windDir.toLabel` | "toward SW" |
| **Upwind quadrant** (which fires affect the station) | `windDir.fromQuadrant` | `'N'` |
| **Downwind quadrant** (where smoke goes) | `windDir.toQuadrant` | `'S'` |

**Never apply `+ 180` to a display label.** "NE" means "wind from the NE" — standard for
every weather app and meteorologist. Applying `+ 180` produces the TO direction (SW), which
looks correct visually next to southward-flowing particles but is non-standard and confusing.

**Fires that affect a station are in the FROM quadrant** (upwind). A fire to the NE with
wind from the NE will carry smoke toward the station. A fire to the SW (downwind) will blow
smoke away.

**In `explain.ts`** use `parseWindDir(wind.directionDeg)` which returns
`{ fromLabel, toLabel, fromQuadrant, toQuadrant }`. Never call `compassFromDeg` or `quadrant`
with a manually computed `+ 180` at the call site — put any new use case inside `parseWindDir`.

**In the frontend** (`InfoPanel.tsx`) use `degToCompass(windVec.directionDeg)` (no `+ 180`)
and prefix the label with "from" in the UI string.

**Urban pollution source upwind detection** uses the bearing FROM the station TO the source
compared against `windDirectionDeg`. Implementation: `packages/backend/src/lib/urbanSources.ts`.

---

## Key constraints and gotchas

**Supabase 1000-row default cap** — PostgREST silently truncates results at 1000 rows.
Any query that could return more than 1000 rows MUST use `.range(from, to)` pagination.
Affected queries:
- `station-readings/latest` — paginated (PAGE_SIZE=1000 loop)
- `weather-ingest` station and station_readings fetches — paginated
- `backfill-station-weather` script — paginated

Setting `.limit(N)` where N > 1000 does NOT bypass the server cap; only `.range()` does.

**Supabase free tier** pauses after 1 week of inactivity. During development, keep ingestion
jobs running, or unpause manually via the Supabase dashboard. 500MB storage limit — monitor
usage; the prune job handles retention automatically.

**Railway cron jobs** — each invocation is a short-lived Node process that exits when done.
Do not deploy ingestion scripts to Vercel.

**FIRMS rate limit** — 5,000 transactions per 10-minute window. Do not trigger ingestion from
the frontend or run it manually in rapid succession.

**OpenAQ versions** — v1 and v2 are retired (January 2025). Use v3 only.

**Schema migrations** — all schema changes use new Supabase migration files. Never modify
existing migrations.

**Never render the same JSX variable in multiple DOM locations** -- storing JSX in a
variable and rendering it once is fine. Rendering it in two branches that can both be
mounted simultaneously (e.g. desktop and mobile layouts) creates two DOM nodes that share
the same `id`, refs, and ARIA attributes. Use a render function instead so each call
produces an independent element tree.

**Vitest `@/` path alias** -- `vitest.config.ts` does not configure the `@/` alias from
`vite.config.ts`. Runtime imports using `@/` in test files or files transitively imported
by tests will fail to resolve. Only `type` imports survive because TypeScript erases them
before Vite transforms the module. For test-importable utility files, use relative paths.

**Browser cache + TanStack Query double-caching** — Fastify routes must return
`Cache-Control: no-store` for empty responses. Sending a cacheable header on an empty body
lets the browser serve that empty body from cache after data arrives, bypassing TanStack's
own cache layer entirely. Equally, `queryFn` fetches should pass `{ cache: 'no-cache' }` so
the browser never acts as a secondary cache on top of TanStack. Omitting either fix produces
silent stale-data bugs that only appear in the window between an empty-then-filled data state
(e.g. post-migration before backfill completes).
