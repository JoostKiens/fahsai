# `/api/explain` — implementation reference

## AI Explanation Cache

Explain responses are cached in Redis with key `explain:v{EXPLAIN_CACHE_VERSION}:{stationId}:{date}:{lang}`.
**Whenever you change the prompt** (in `buildPrompt.ts` or `buildScientificContext.ts`), bump
`EXPLAIN_CACHE_VERSION` in `packages/backend/src/routes/explain.ts`. Old keys orphan and expire
naturally after 7 days. Caching is production-only — dev always generates fresh.

---

## Back-trajectory ensemble

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

## Persistent wind direction context

When `station_weather` shows wind from a consistent direction (all 5 days within ±45°
of the circular mean), a `PERSISTENT WIND DIRECTION` section is added to the prompt.
This surfaces sources that lie in that direction beyond the 66-hour trajectory window —
physically plausible contributors the trajectory doesn't capture.

**Computation:** circular mean of `wind_direction_deg` from `station_weather` for
`d0`–`d4`. Consistency check: every reading within ±45° of the mean. Requires ≥ 3
days of data.

**Source filter:** sources from `relevantSources` where `distKm > corridorKm` AND
bearing from station to source is within ±45° of `persistentWind.directionDeg`.

**In the prompt:** framed as background context with uncertainty, not as confirmed
cause. The model should reference these sources as places the air "may have passed
over" before the trajectory window, not as direct contributors to the current reading.

---

## Urban pollution sources

A static list of major cities and industrial areas in mainland Southeast Asia is maintained in
`packages/backend/src/data/urbanSources.ts`. Used by `/api/explain` to identify upwind urban
emission sources when building the Gemini prompt context. No API calls — static data at runtime.

**Influence score** = `population / distanceKm²` (or `emissionProxy`-based for power plants
and industrial zones). Sources below a minimum threshold (default 50) are excluded.

**Upwind detection**: a source is upwind if its minimum distance to any waypoint across all
5 ensemble trajectory members is within `corridorKm`. This replaces the earlier bearing-angle
check against today's wind snapshot — trajectory proximity is physically correct because it
asks whether the air mass actually passed near the source, not whether the source is in
today's wind direction.

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
