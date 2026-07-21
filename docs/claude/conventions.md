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

**Urban pollution source upwind detection** checks proximity to the back-trajectory ensemble
(a source is upwind if it falls within the corridor of any trajectory member), not a bearing
check against `windDirectionDeg`. Implementation: inline in `packages/backend/src/routes/explain.ts`
(see `docs/claude/explain.md`).

---

## Wind particle density — never use raw viewport width as a zoom signal

`packages/frontend/src/components/Map/useWindParticles.ts` derives particle count, trail
length, and trail alpha from `rawViewportWidth` (`map.getBounds()` east-west span, in
degrees). `rawViewportWidth` equals `containerWidthPx × degreesPerPixel(zoom)` — it is **not**
a pure zoom signal. A narrow/mobile container reads as "zoomed in further" to any formula
keyed on `rawViewportWidth` alone, even at the exact same zoom as a wide desktop container.

Any zoom-dependent scaling in that file (particle density, trail length/alpha, or future
additions) must go through `zoomOnlyWidth(rawViewportWidth, containerWidthPx)` — which strips
the container-width contribution back out — or use `map.getZoom()` directly. Never compare
`rawViewportWidth` against a fixed threshold to decide "is the user zoomed in."

This exact bug has shipped **twice**: `bf2f3f2`/`a4816ce` established width-independent
density via `viewportParticleCount()`'s area-proportional scaling, then `41295e3` (tuned by
`164b529`/`53452be`) silently reintroduced it by adding a `zoomCompensation` multiplier and
`MAX_PARTICLE_COUNT` high-zoom ceiling keyed off raw `rawViewportWidth`, undoing the earlier
fix through an unrelated code path. `viewportParticleCount` and `dynamicTrailParams` are
exported and covered by `useWindParticles.test.ts` specifically to catch a third regression —
keep those tests passing if you touch the density or trail-length/alpha formulas.

---

## Frontend component structure

**Barrel files (`index.ts`)** are only justified when they re-export 2+ things consumed
by 2+ external files (e.g. `Sidebar/index.ts` re-exports `Sidebar` and `LayerGroups` for
`App.tsx` and `SidebarToggleFAB.tsx`). A barrel with one export and one consumer is pure
indirection with no payoff — delete it and import the file directly instead.

**Single-file component directories** get flattened to `components/` root instead of
wrapped in their own folder (e.g. `BottomSheet.tsx`, `HintPill.tsx`, `SidebarToggleFAB.tsx`,
`ErrorBoundary.tsx`, `UIOverlay.tsx`, `Shimmer.tsx`, `AppScrollArea.tsx`). A directory is
only justified once a component has co-located siblings (test, hook, helper).

**Icon components** default to inline and unexported, private to the single file that
uses them (e.g. `XIcon` in `BottomSheet.tsx`, `CursorClickIcon` in `HintPill.tsx`). Only
extract to a shared file when a set of icons is genuinely reused by 2+ consumers (e.g.
`Header/Icons.tsx`, used by `Header.tsx`, `HeaderMenu.tsx`, `Search.tsx`). A shared icon
file is PascalCase, since it holds components — not `icons.tsx`.

---

## Key constraints and gotchas

**Workspace packages need `"type": "module"` before their first real export** — a
`packages/*/package.json` without `"type": "module"` is harmless as long as the package
only has type-only exports (interfaces, type aliases erase at compile time, so there's no
runtime module to load). The moment it gains a real value export (a function or `const`),
Node's `require(esm)` cycle detection under tsx (Node 22.17/22.19) breaks, with a misleading
error that depends on the import graph shape — either `SyntaxError: ... does not provide an
export named X` or `ERR_REQUIRE_CYCLE_MODULE`, neither of which points at the missing field.
Add `"type": "module"` when a package gets its first runtime export, not after chasing the
error (`packages/types` hit this when `classifyReading` moved in).

**Known debt: several `fetchExplainContext.ts` queries never check `.error`** —
`peerRowsResult`, `stationWeatherRows`, `pressureResult`, and `baselineResult` in
`packages/backend/src/lib/fetchExplainContext.ts` all read `.data` directly without checking
`.error` (only `stationRows.error` is checked, and thrown). A DB/RLS failure on any of these
degrades silently and identically to "no data for this station" — with no log line to tell the
two apart. This predates the `station_baseline` addition and spans multiple queries, so fix it
as one file-wide pass adding error logging to all four, not query-by-query as each one happens
to get touched by an unrelated feature.

**`git mv` case-only renames on macOS** — renaming a file to a different casing only
(e.g. `icons.tsx` → `Icons.tsx`) requires a two-step move (`git mv icons.tsx icons.tsx.tmp`
then `git mv icons.tsx.tmp Icons.tsx`) because macOS's default case-insensitive filesystem
treats the two names as the same path. A direct `git mv icons.tsx Icons.tsx` can silently
no-op or leave git confused about the rename.

**Supabase 1000-row default cap** — PostgREST silently truncates results at 1000 rows.
Any query that could return more than 1000 rows MUST use `.range(from, to)` pagination.
Use the shared helpers in `packages/backend/src/utils/backfill.ts` rather than hand-rolling
a pagination loop — despite the filename, they're used across routes, cron jobs, and
one-off scripts, not just backfills:
- `fetchAllPages<T>(buildQuery, pageSize)` — fetches every page into memory, returns `T[]`.
  Use for anything that needs the full result set at once (most cases).
- `forEachPage<T>(buildQuery, pageSize, onPage)` — streams one page at a time without
  buffering the full result set. Use this instead of `fetchAllPages` when the original
  logic filtered/deduped per page (e.g. `station-readings/latest`'s bbox + dedup pass) —
  collapsing a streaming filter into "fetch everything, then filter" multiplies peak memory
  by however many rows get filtered out, which matters on hot, live-traffic routes.

Both throw on any Supabase error. If a call site's original behavior was to degrade
gracefully or return a specific error response instead of throwing, wrap the call in its
own `try/catch` rather than letting the shared helper's throw propagate uncaught.

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

**Ingest date semantics**: `weather_readings`, `station_weather`, `cams_grid`, and
`station_fire_pressure` `date` columns are Bangkok calendar days (Asia/Bangkok), not UTC days.
Open-Meteo requests use `timezone: 'Asia/Bangkok'` for exactly this reason (a UTC-day fetch
sums `precipitation_sum` over the wrong 24h window). Don't reintroduce `timezone: 'UTC'` or an
ad-hoc UTC `new Date().toISOString().slice(0, 10)` in ingest code; use the helpers in
`packages/backend/src/utils/bkkDate.ts` instead:
- `bangkokDateString(instant)` converts an instant to its Bangkok calendar day string.
- `getYesterdayBkk()` is the common "yesterday BKK" default (used by `weather-ingest.ts`,
  `cams-ingest.ts`, `station-readings-ingest.ts`, and `ingest-station-fire-pressure.ts`).
- `bangkokMidnightIso(dateStr)` converts a BKK date string to its midnight instant as an ISO
  string (`${dateStr}T00:00:00+07:00`), for query range boundaries (e.g. `fires.ts`, `explain.ts`).
- `bangkokMidnightUtcMs(dateStr)` does the same, as epoch ms (e.g. `station-readings.ts`'s
  `/history` route, `fetchExplainContext.ts`).

Only fall back to manual `ICT_OFFSET_MS` arithmetic when none of the above fit and you need a
UTC millisecond instant, not a date string, since `Intl.DateTimeFormat` only produces the latter.

The `weather-today`/`weather-fallback`/`cams`/`cams-fallback`/`station-fire-pressure`/
`station-readings-today`/`station-readings` cron times in `packages/backend/railway/*.json`
all currently fire before 17:00 UTC (or, for the `cams`/`cams-fallback` and
`station-readings-today`/`station-readings` pairs, at a time whose Bangkok-yesterday still
resolves to the same date their old UTC-based calc used), so BKK-today equals UTC-today at
every run and `getYesterdayBkk()` returns the same date the pre-fix UTC calc would have. If any
of these cron times are ever moved, re-derive which Bangkok day `getYesterdayBkk()` resolves to
at the new run time before assuming the schedule still targets the intended date.

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

**Redis cache staleness across boundary-changing migrations**: routes that cache immutable
historical data (`fires.ts`, `station-readings.ts`, `weather-ingest.ts`, `cams-ingest.ts`) use
a 7-day TTL (`HISTORICAL_TTL_SECONDS`). If a migration changes a route's query-boundary
semantics (e.g. UTC day to Bangkok day), entries cached before deploy keep serving the old
boundary until they naturally expire. Accept this as a self-healing transition cost rather than
versioning cache keys, unless immediate consistency is required, in which case flush the
affected keys manually post-deploy.

**Windowed-pool fetch range must double the window** — when computing a rolling ±W window
statistic (e.g. `station_baseline`'s `WINDOW = 7`) for a *range* of target values rather than
a single one, the data you fetch must span the target range padded by `±W` on each side, not
just `±W` around a single center point. If N target values span `[t0, t1]`, the raw data
needed spans `[t0 - W, t1 + W]` — fetching only `±W` around the range's center starves the
pool for target values at the edges.

**Folding multiple source keys onto one bucket accumulates, never overwrites** — when
multiple real values fold onto the same derived key (e.g. `station-baseline.ts` folds a
leap year's Feb 29 onto day 28), push onto an array (`Map<K, V[]>`) rather than
`Map.set(key, value)` (`Map<K, V>`). A plain `.set()` silently drops all but the last value
written for that key.

**Prefer already-ingested data over re-fetching an external source** — before adding an
incremental/daily job that re-fetches from an external archive or API to keep a derived
table fresh, check whether the same data is already sitting in one of our own tables from
an existing daily ingest job. `station_baseline`'s daily upkeep (`ingest-station-baseline.ts`)
originally re-fetched the OpenAQ S3 archive for the current year, mirroring the historical
backfill's approach — but `station_readings` already had that exact data from the nightly
pm25 ingest, making the S3 call entirely redundant.
