# Architecture — data sources, ingestion, API routes

## Architecture principle

**The frontend never calls third-party APIs directly.** All external data is fetched
by backend scheduled jobs, stored in Supabase and/or cached in Redis, and served to
the frontend through our own Fastify API. This decouples the UI from rate limits and
keeps API keys server-side.

---

## Data sources and ingestion

### NASA FIRMS — active fire points (VIIRS)

- Source: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/1/{date}`
- Bounding box: `89,1,114,30` — matches viewport MAX_BOUNDS (covers Myanmar, Thailand, Laos,
  Cambodia, Vietnam, Malaysia, and partial India/China/Bangladesh)
- Schedule: daily (0 10 \* \* \*) — last satellite pass lands ~06:12 UTC, in DB by ~09:00 UTC
- Storage: Supabase `fire_points` table (PostGIS point geometry)
- Cache: Redis `fires:date:{date}` TTL 7d
- License: NASA open data, no redistribution restrictions
- Key field: `frp` (Fire Radiative Power in MW) — use to scale point size in the UI

### OpenAQ — PM2.5 station readings

- Source: OpenAQ v3 API `https://api.openaq.org/v3/`
- Endpoints:
  - `/v3/locations` — weekly station sync, populates `pm25_sensor_ids` and `datetime_last`
  - `/v3/sensors/{id}/hours/daily` — daily averages per sensor; `/days` endpoint is confirmed
    broken (ignores date filters); `/hours/daily` requires local timezone offset in datetime params
- Parameters: `pm25` only
- Schedule: two-pass daily (see ingestion jobs below)
- Storage: Supabase `stations` + `station_readings` tables
- Cache: Redis `station-readings:latest:{param}:{date|current}` TTL 7d
- License: CC BY 4.0 — attribution required in UI
- Note: check the `attribution` field in API responses — some Thai stations have their own requirements

### Open-Meteo — weather grid

- Source: `https://api.open-meteo.com/v1/forecast` (today) /
  `https://archive-api.open-meteo.com/v1/archive` (past dates)
- Parameters:
  - Hourly snapshot at 07:00 UTC (14:00 BKK): `wind_speed_10m`, `wind_direction_10m`, `relative_humidity_2m`
  - Daily aggregates: `wind_speed_10m_max`, `precipitation_sum`
- No API key required
- Grid: 0.4° spacing over bbox `[89,1,114,30]` → 63 × 73 = 4,599 points per date.
  Fetched in 16 batches of ≤300 with 5 s between batches (~80 s total).
  Batch size capped at 300 — payload grows linearly; 500 caused 413 errors (confirmed May 2026).
  Free tier counts HTTP requests (not locations): 16 calls/day is well within the 10,000/day limit.
  429 backoff: 65 s for minutely, 65 min for hourly, abort with exit code 1 for daily.
- Schedule: daily (0 2 \* \* \* UTC)
- Storage:
  - Supabase `weather_readings` (persistent, 120-day retention) + Redis `weather:{date}` TTL 7d
    and `weather:wind:{date}` TTL 7d. Ingest writes to both. Wind route checks Redis first;
    on miss reads from Supabase. ERA5 reanalysis (CDS API) is used to backfill dates prior to
    the weather-ingest cron start date — all data (Open-Meteo + ERA5) is stored at 0.4°
    resolution. Run: `pnpm --filter backend run backfill:weather -- --start=YYYY-MM-DD --end=YYYY-MM-DD`
  - Supabase `station_weather` — pre-computed per-station per-day weather, populated by
    `weather-ingest` after the grid is stored. **No Redis layer** — queried directly from
    Supabase by the history endpoint.
- Coordinate storage: ingest stores the **requested** grid lat/lng (lats[i]/lngs[i] from the
  batch arrays), NOT the API-response coordinates. The API may return slightly different floats
  (e.g. 13.7999997 vs 13.8); using requested coords ensures stored values match the snap formula exactly.
- License: CC BY 4.0 — attribution link required in UI footer
- Consumed by: wind particle layer + station InfoPanel's 5-day weather table

### Open-Meteo Air Quality — PM2.5 gridded model (CAMS)

- Source: `https://air-quality-api.open-meteo.com/v1/air-quality`
- Parameters: `pm2_5` (hourly), daily mean computed per grid point
- Grid: 0.4° spacing over bbox [89,1,114,30] → 4,599 points; fetched in 16 batches of 300
  (sequential, with 429 retry backoff)
- No API key required
- Schedule: daily (0 23 \* \* \* UTC)
- Storage: Supabase `cams_grid` + Redis `cams:pm25:{YYYY-MM-DD}` TTL 7d. Route checks Redis
  first; on miss reads from Supabase. Ingest writes to both. Pruned after 120 days.
- License: CC BY 4.0 (same Open-Meteo footer attribution covers both weather and AQ)
- Data source: CAMS (Copernicus Atmosphere Monitoring Service), ~11 km resolution
- Script: `pnpm --filter backend run ingest:cams YYYY-MM-DD`
- Daily summary: cams-ingest also stores the day's 95th-percentile PM2.5 in `cams_daily_summary`
  (gated on a complete grid). Backfill: `pnpm --filter backend run backfill:cams-summary -- --start=YYYY-MM-DD --end=YYYY-MM-DD`.
  Served by `GET /api/cams/summary` (below) to draw the time scrubber's gradient line chart.

---

## Scheduled ingestion jobs (Railway cron)

Each job is a standalone script in `packages/backend/src/jobs/`, invoked directly by Railway
cron. Schedules are configured in Railway's cron service UI. All times are UTC.

```
firms-ingest          — daily     (0 10 * * *)   fetches VIIRS data for TODAY; last pass lands
  ingest-firms-today                              ~06:12 UTC, in DB by ~09:00, so 10:00 guarantees
                                                  a complete day before storing

stations-ingest       — weekly    (0 22 4 * *)    fetches OpenAQ locations by bbox, upserts stations
                                                  including pm25_sensor_ids and datetime_last;
                                                  skips locations where datetimeLast > 30 days

cams-ingest           — daily     (0 23 * * *)   fetches CAMS PM2.5 grid for TODAY via
  ingest-cams-today                               ingest-cams-today.ts; single pass — CAMS is
  ingest-cams-today-fallback                      deterministic so values don't change between runs;
                                                  grid visible by ~23:30 UTC (06:30 BKK).
                                                  Fallback runs at (0 1 * * *): targets yesterday
                                                  (already next calendar day); re-ingests if
                                                  cams_grid has < 4,000 rows for that date.

station-readings-ingest (pass 1) — daily (0 23 * * *)  reads pm25_sensor_ids from stations, fetches pm25
  ingest-station-readings-today                         daily averages for TODAY via /hours/daily;
                                                        BKK day closes 16:59 UTC — 6h processing buffer;
                                                        station_readings visible by ~23:30 UTC (06:30 BKK).
                                                        A second phase at the end of this job computes 75 km
                                                        radius area fire pressure scores for all active stations
                                                        and upserts to station_fire_pressure.

station-readings-ingest (pass 2) — daily (0 4 * * *)   fetches pm25 daily averages for YESTERDAY as safety
  ingest-station-readings                               net; overwrites any partial values pass 1 wrote
                                                        before all stations had reported
                                                        (ignoreDuplicates: false)

weather-ingest        — daily     (0 2 * * *)    fetches Open-Meteo weather grid for YESTERDAY at
  ingest-weather-today                            07:00 UTC snapshot via forecast API (NWP model
  ingest-weather-today-fallback                   data, not ERA5 reanalysis); upserts to Supabase
                                                  weather_readings and Redis (weather:{date} +
                                                  weather:wind:{date}, TTL 7d). After storing the
                                                  grid, pre-computes station_weather for all stations
                                                  that reported pm25 that date. Uses paginated
                                                  .range() queries to bypass Supabase 1000-row cap.
                                                  Data visible by ~02:10 UTC (09:10 BKK).
                                                  Fallback runs at (0 4 * * *): checks row count
                                                  for yesterday; re-ingests if < 4,000 rows.

prune                 — daily     (0 2 * * *)    deletes fire_points, station_readings, cams_grid,
                                                  weather_readings, station_weather,
                                                  station_fire_pressure, cams_daily_summary
                                                  rows > 120 days

backfill-weather      — one-off   (manual)        ERA5 reanalysis backfill for weather_readings.
  backfill:weather                                Single CDS API request for full date range → one
                                                  NetCDF → Python parse (era5-parse.py) → resample
                                                  0.25°→0.4° → upsert + station_weather pre-computation.
                                                  Skip dates with ≥ 4,000 existing rows. No Redis writes.
                                                  Run: pnpm --filter backend run backfill:weather \
                                                       -- --start=YYYY-MM-DD --end=YYYY-MM-DD
```

The UI shows the most recent date where all three gating sources have complete data
(AQ grid ≥ 4,000 rows, fires ≥ 1, station_readings ≥ 1), served by `GET /api/latest-date`.
The date typically becomes available at ~23:30 UTC (06:30 BKK).
If station-readings-ingest pass 1 misses slow-reporting stations, pass 2 fills gaps at ~04:30 UTC (11:30 BKK).
See `docs/adr/0001-two-pass-ingest-schedule.md`.

Each script exits with code 0 on success and non-zero on failure. Retry logic is implemented
within the script (3 attempts with exponential backoff where applicable).

---

## API routes (Fastify backend)

All routes return JSON. All accept a `bbox` query param where spatial filtering is needed
(format: `west,south,east,north`, default: `89,1,114,30`).

```
GET /api/fires?date=YYYY-MM-DD&bbox=...
  Returns fire points for a given date. Checks Redis first, falls back to Supabase.
  Supports optional query params: confidence=high,nominal

GET /api/fires/range?start=YYYY-MM-DD&end=YYYY-MM-DD&bbox=...
  Returns fire points for a date range (used by time scrubber). Max 10 days.

GET /api/station-readings/latest?parameter=pm25&bbox=...&date=YYYY-MM-DD
  Returns latest measurement per station for the given parameter.
  date is optional: when provided, queries that day's window; when absent, queries last 24h.
  Redis first (key: station-readings:latest:{param}:{date|current}), then Supabase.
  Supabase query is paginated (PAGE_SIZE=1000, .range()) to bypass the server-side row cap —
  do NOT remove the pagination or stations will silently disappear from the map.

GET /api/station-readings/history?station_id=...&parameter=pm25&hours=24
  Returns time series for a single station and parameter.
  Used in station tooltip chart.

GET /api/stations/:stationId/history?days=5&date=YYYY-MM-DD
  Returns `days` daily rows (oldest-first) ending on `date` (BKK timezone).
  Each row: { date, maxPm25, readingCount, weather: { windSpeedKmh, windDirectionDeg,
  precipitationSumMm, relativeHumidity2m } | null }.
  Single parallel DB round-trip: station_readings + station_weather.
  No Redis caching — browser Cache-Control + TanStack Query (staleTime: Infinity) handle
  client-side caching. Weather comes from station_weather (pre-computed at ingest time),
  NOT from weather_readings — do not add weather_readings lookups here.

GET /api/stations?bbox=...
  Returns all stations with their available parameters.

GET /api/weather?date=YYYY-MM-DD&bbox=...
  Returns weather grid for the given date. date param is required (400 if absent/invalid).
  Redis cache key: weather:{date}, TTL 7d. On miss, reads from Supabase weather_readings.
  Does not fetch from Open-Meteo on demand — data must have been ingested by weather-ingest.
  Returns 404 if no rows exist for the requested date.
  Response includes all weather_readings fields; wind, precipitation, and humidity are
  consumed by the station InfoPanel's 5-day weather table.

GET /api/cams?date=YYYY-MM-DD&bbox=...
  Returns CAMS gridded PM2.5 for a specific date (up to 4,599 points).
  Redis first (key: cams:pm25:{date}, TTL 7d); on miss reads from Supabase cams_grid.

GET /api/cams/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
  Returns the daily p95 PM2.5 time series ({ date, pm25 }[]) for the scrubber gradient chart.
  Redis first (key: cams:summary:{start}:{end}, TTL 1h — newest day mutates each ingest);
  on miss reads from Supabase cams_daily_summary. Range capped at 130 days.

GET /api/power-plants
  Returns WRI power plants (Coal/Gas/Oil) for THA/MMR/LAO/KHM as GeoJSON FeatureCollection.
  Redis cache key: power_plants:geojson, TTL 24h.
  Populate via: pnpm --filter backend run ingest:power-plants

GET /api/latest-date
  Returns the most recent date with complete data across all three gating sources.
  Redis key: latest-complete-date, TTL 30 min.

GET /api/explain  (POST)
  Streams a Gemini-generated explanation for a station's current AQI. No Redis caching.
  See docs/claude/conventions.md for the back-trajectory ensemble details.

GET /health
  Returns { status: 'ok', cache: 'connected', db: 'connected' }
```

---

## Caching reference

`CACHE_CONTROL_IMMUTABLE = public, max-age=604800` (7 days).
`HISTORICAL_TTL_SECONDS = 604800` — standard Redis TTL for all immutable historical data.

| Route                               | Redis key                                         | Redis TTL | On miss                                                    | HTTP Cache-Control                                              |
| ----------------------------------- | ------------------------------------------------- | --------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/fires?date=`              | `fires:date:{date}`                               | 7 days    | Supabase `fire_points`                                     | `CACHE_CONTROL_IMMUTABLE`                                       |
| `GET /api/fires/range`              | —                                                 | —         | Supabase `fire_points`                                     | `CACHE_CONTROL_IMMUTABLE`                                       |
| `GET /api/station-readings/latest`  | `station-readings:latest:{param}:{date\|current}` | 7 days    | Supabase `station_readings` (paginated)                    | `CACHE_CONTROL_IMMUTABLE`                                       |
| `GET /api/station-readings/history` | —                                                 | —         | Supabase `station_readings`                                | none set                                                        |
| `GET /api/stations/:id/history`     | —                                                 | —         | Supabase `station_readings` + `station_weather` (parallel) | `CACHE_CONTROL_IMMUTABLE` (historical) / `max-age=3600` (today) |
| `GET /api/weather/wind?date=`       | `weather:wind:{date}`                             | 7 days    | Supabase `weather_readings`                                | `CACHE_CONTROL_IMMUTABLE`                                       |
| `GET /api/weather?date=`            | `weather:{date}`                                  | 7 days    | Supabase `weather_readings`                                | `CACHE_CONTROL_IMMUTABLE`                                       |
| `GET /api/cams?date=`               | `cams:pm25:{date}`                                | 7 days    | Supabase `cams_grid`                                       | `CACHE_CONTROL_IMMUTABLE`                                       |
| `GET /api/cams/summary`             | `cams:summary:{start}:{end}`                      | 1 hour    | Supabase `cams_daily_summary`                              | `public, max-age=3600`                                         |
| `GET /api/power-plants`             | `power_plants:geojson`                            | 7 days    | Supabase `power_plants`                                    | `CACHE_CONTROL_IMMUTABLE`                                       |
| `GET /api/latest-date`              | `latest-complete-date`                            | 30 min    | Supabase row counts                                        | none set                                                        |
| `GET /api/explain`                  | —                                                 | —         | Streams from Gemini API                                    | none set                                                        |

**Rules:**

- Routes with a Redis key check Redis first; on miss query Supabase, then write back to Redis
  (fire-and-forget for non-blocking routes).
- `GET /api/stations/:id/history` has **no Redis layer** — 1 parallel DB RTT is fast enough
  and hit rate is too low to justify the round-trip cost. TanStack Query + Cache-Control handle
  client-side caching.
- Only default-bbox requests are Redis-cached for `station-readings/latest`; custom bbox always
  hits Supabase.
