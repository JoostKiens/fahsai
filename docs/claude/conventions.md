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

## Back-trajectory ensemble (`/api/explain`)

The explain endpoint uses a 5-member backward trajectory ensemble to identify the 72-hour
transport footprint of air arriving at a station.

### How it works

- 5 trajectories are traced from the station position (center + 4 cardinal offsets of 0.4°)
  using daily wind grids stored in `weather_readings`.
- Each trajectory steps backward in 6-hour increments for up to 72 hours, using the nearest
  grid point's wind vector at each step.
- The ensemble footprint (bounding box of all waypoints + corridor padding) is used to query
  fires, CAMS PM2.5, and urban/industrial/power-plant sources.
- A **cumulative fire pressure score** (0–100) weights fires by FRP, recency, and proximity
  to the trajectory path.
- When a station is a **strong outlier** (≥2× or ≤0.4× peer median), the trajectory, CAMS,
  and fire sections are omitted — regional transport data is not relevant for hyperlocal anomalies.

### Implementation

- Pure trajectory computation in `packages/backend/src/utils/trajectory.ts` — no I/O.
- Wind grids fetched for 3 dates (`d0`, `d1`, `d2`) in parallel, Redis-first (`weather:{date}`,
  TTL 7d) with Supabase `weather_readings` fallback.
- `getWindGrid` returns `WeatherReading[]` (from `@thailand-aq/types`), which is a structural
  superset of `WindGridPoint` and includes `precipitation_sum` and `relative_humidity_2m`
  used for the `WEATHER CONTEXT` prompt section.
- CAMS data: Redis key `cams:pm25:{date}` (TTL 7d), fallback to `cams_grid`.
- Seasonal context string selected by month: peak burning (Feb–Apr), early/late dry (Oct–Jan),
  monsoon (May–Sep).

### Helper function signatures

`nearestGridPoint(lat, lng, grid)` — lat first, consistent with all other geo functions
(`haversineKm`, `bearingDeg`). Do not reverse the argument order.

---

## Urban pollution sources

A static list of major cities and industrial areas in mainland Southeast Asia is maintained in
`packages/backend/src/data/urbanSources.ts`. Used by `/api/explain` to identify upwind urban
emission sources when building the Gemini prompt context. No API calls — static data at runtime.

**Influence score** = `population / distanceKm²` (or `emissionProxy`-based for power plants
and industrial zones). Sources below a minimum threshold (default 50) are excluded.

**Upwind detection**: a source is upwind if the bearing FROM the station TO the source aligns
within ±60° of `windDirectionDeg`.

Influence formula:
```
populationScore = source.population / effectiveDist²
emissionScore   = (source.emissionProxy × 10_000) / effectiveDist²
influenceScore  = populationScore + emissionScore
```
Influence is computed relative to proximity along the trajectory path (minimum distance to any
center-trajectory waypoint), not straight-line distance from the station.

Files:
- `packages/backend/src/data/urbanSources.ts` — static data array (do not sync from external source)
- `packages/backend/src/lib/geo.ts` — `haversineKm`, `bearingDeg`, `compassFromDeg`
- `packages/backend/src/lib/urbanSources.ts` — `getRelevantUrbanSources()` helper

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

**Mapbox attribution** — the attribution control must remain visible at all times. Do not hide it.

**PostGIS types** — use `geography(Point, 4326)` not `geometry` for distance calculations
in meters without projection math.

**Schema migrations** — all schema changes use new Supabase migration files. Never modify
existing migrations.
