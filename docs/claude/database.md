# Database schema (Supabase / PostGIS)

All schema changes use new Supabase migration files. Never modify existing migrations.

```sql
-- Enable PostGIS
create extension if not exists postgis;

-- Fire detections from VIIRS NOAA-21 NRT
-- Columns dropped in migrations 016, 019, 020: fire_type, location, brightness,
-- bright_ti4, bright_ti5, country_id, satellite, source, created_at.
create table fire_points (
  id           bigserial primary key,
  detected_at  timestamptz not null,
  lat          float8 not null,
  lng          float8 not null,
  frp          float8,           -- fire radiative power (MW)
  confidence   text,             -- 'low', 'nominal', 'high'
  daynight     text              -- 'D' or 'N'
);
create index on fire_points (detected_at);
create index on fire_points (confidence);

-- Monitoring station metadata (upserted on ingestion, rarely changes)
create table stations (
  id               text primary key,   -- OpenAQ locations_id as text
  name             text not null,
  location         geography(Point, 4326),
  country          text,               -- 'TH', 'MM', 'LA', 'KH'
  provider         text,               -- e.g. 'PCD Thailand'
  is_mobile        boolean default false,
  is_monitor       boolean,            -- true = reference grade, false = low-cost sensor
  parameters       text[],             -- array of parameters this station measures
  pm25_sensor_ids  int4[]      default '{}',  -- OpenAQ sensor IDs for pm25; array because a
                                              -- location may have multiple pm25 sensors
  datetime_last    timestamptz,               -- last reported; used to skip stale stations (> 30 days)
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index on stations using gist(location);
create index on stations (country);

-- Time-series measurements (appended on every ingestion run)
-- Renamed from `measurements` to `station_readings` in migration 014.
create table station_readings (
  id           bigserial primary key,
  station_id   text not null references stations(id),
  sensor_id    int4 not null,      -- OpenAQ sensors_id
  parameter    text not null,      -- 'pm25', 'pm10', 'no2', 'o3', 'so2', 'co', 'bc'
  value        float8 not null,
  unit         text not null,      -- 'µg/m³', 'ppm', etc.
  measured_at  timestamptz not null,
  created_at   timestamptz default now()
);
create index on station_readings (station_id, parameter, measured_at);
create index on station_readings (parameter, measured_at);
create index on station_readings (measured_at);

-- Power plants (WRI Global Power Plant Database, CC BY 4.0)
-- Populated via: pnpm --filter backend run ingest:power-plants
create table if not exists power_plants (
  id                serial primary key,
  name              text not null,
  country           char(3) not null,
  fuel_type         text not null check (fuel_type in ('Coal', 'Gas', 'Oil')),
  capacity_mw       numeric(8, 2),
  owner             text,
  commissioned_year integer,
  lat               float8 not null,
  lng               float8 not null,
  location          geography(Point, 4326) not null
);
create index if not exists power_plants_location_idx on power_plants using gist(location);
create index if not exists power_plants_fuel_type_idx on power_plants (fuel_type);

-- CAMS PM2.5 gridded model (005_aq_grid.sql, renamed to cams_grid in 013_rename_aq_grid.sql)
-- `date` is a Bangkok calendar day (Asia/Bangkok): Open-Meteo is queried with
-- timezone=Asia/Bangkok so start_date/end_date and the hourly average window
-- both cover 00:00-24:00 BKK, not UTC.
-- Pruned after 140 days. Redis (cams:pm25:{date}, TTL 7d) is the hot cache.
create table if not exists cams_grid (
  date  date    not null,
  lat   float8  not null,
  lng   float8  not null,
  pm25  float8  not null,
  primary key (date, lat, lng)
);
create index if not exists cams_grid_date_idx on cams_grid (date);

-- Weather grid (Open-Meteo, snapshot at 14:00 BKK / Asia/Bangkok)
-- `date` is a Bangkok calendar day for the same reason as cams_grid above.
-- Pruned after 140 days. Redis (weather:{date}, TTL 7d) is the hot cache.
create table if not exists weather_readings (
  date                      date   not null,
  lat                       float8 not null,
  lng                       float8 not null,
  wind_speed_kmh            float8 not null,  -- daily mean
  wind_direction_deg        float8 not null,  -- meteorological FROM-direction, snapshot at 14:00 BKK
  precipitation_sum         float8,           -- daily total mm (Bangkok calendar day, 00:00–24:00 BKK)
  relative_humidity_2m      float8,           -- % at 14:00 BKK snapshot
  primary key (date, lat, lng)
);
create index if not exists weather_readings_date_idx on weather_readings (date);
-- (lat, lng, date) index added in migration 017 for efficient per-station lookups
create index if not exists weather_readings_lat_lng_date_idx on weather_readings (lat, lng, date);

-- Pre-computed weather per station per day (migration 018_station_weather.sql)
-- Populated by weather-ingest after the grid is stored. `date` is a Bangkok
-- calendar day, matching weather_readings (the /history route joins pm2.5,
-- itself binned by BKK day, against this table by the same date key).
-- The history endpoint queries this directly (no weather_readings lookup at request time).
-- Station source: distinct station_ids from station_readings for that date.
-- Pruned after 140 days by the prune job.
create table if not exists station_weather (
  date                  date NOT NULL,
  station_id            text NOT NULL REFERENCES stations(id),
  wind_speed_kmh        float8,
  wind_direction_deg    float8,
  precipitation_sum     float8,
  relative_humidity_2m  float8,
  PRIMARY KEY (station_id, date)   -- leading station_id optimises the history query
);

-- Fire pressure scores (75 km radius, 14-day rolling window, anchored at Bangkok
-- midnight; `date` is a Bangkok calendar day, matching weather_readings/cams_grid
-- since fetchExplainContext.ts joins all three by the same date key)
-- Computed by station-readings-ingest (pass 1) for all active stations.
-- Pruned after 140 days by the prune job.
create table station_fire_pressure (
  station_id   text          not null references stations(id),
  date         date          not null,
  score        numeric(6,2)  not null default 0,
  fire_count   integer       not null default 0,
  total_frp_mw numeric(10,2) not null default 0,
  primary key  (station_id, date)
);
create index on station_fire_pressure (date);

-- Seasonal PM2.5 baseline per station per calendar day (030-032).
-- Precomputed from multi-year OpenAQ S3 archive (windowed median, p25, p75).
-- Near-static, not pruned. Backfill: pnpm --filter backend run backfill:station-baseline
create table station_baseline (
  station_id   text     not null references stations(id),
  month        smallint not null check (month between 1 and 12),
  day          smallint not null check (day between 1 and 31),
  median_pm25  real     not null,
  p25_pm25     real     not null,
  p75_pm25     real     not null,
  n            integer  not null,
  min_year     smallint,
  max_year     smallint,
  primary key (station_id, month, day)
);

-- Daily nationwide CAMS PM2.5 summary, one row per date (028_cams_daily_summary.sql).
-- Stores the 95th-percentile PM2.5 across that day's cams_grid; powers the time
-- scrubber's gradient line chart. Computed during cams-ingest (gated on a complete grid)
-- and backfilled from cams_grid. Pruned after 140 days by the prune job.
create table cams_daily_summary (
  date         date              primary key,
  pm25_p95     double precision  not null,
  point_count  integer           not null,  -- grid completeness at compute time
  created_at   timestamptz       not null default now()
);
```

---

## OpenAQ v3 data model

OpenAQ v3 hierarchy: **Location → Sensors → Measurements**. Each location (station) contains
multiple sensors; each sensor tracks exactly one parameter. Station metadata and measurement
ingestion are split across two separate jobs:

- `stations-ingest` (monthly): upserts location metadata into `stations`, including
  `pm25_sensor_ids` and `datetime_last`. Skips locations where `datetimeLast > 30 days`.
- `ingest:station-readings` (two-pass daily): reads `pm25_sensor_ids` directly from
  `SELECT id, pm25_sensor_ids FROM stations WHERE pm25_sensor_ids != '{}'`. No API call
  to `/locations` during daily ingest. Only `pm25_sensor_ids[0]` is fetched per station —
  collocated sensors measure the same air; the map shows one value per location. All IDs
  are retained in the array for future use. On fresh deployment, run `ingest:stations`
  before the first `ingest:station-readings`.

Parameter ingested: `pm25` only. The `station_readings` schema supports additional parameters
for future use.

**Do not recreate the `aqi_readings` table** — it was replaced by the `stations` +
`station_readings` two-table design.

---

## 140-day retention

The prune job deletes rows older than **140 days** (uniform across all tables it touches:
`fire_points`, `station_readings`, `cams_grid`, `weather_readings`, `station_weather`,
`station_fire_pressure`, and `cams_daily_summary`).

Basis: the 90-day max scrubber window + a 7-day buffer for the Explain feature's measurement
history + a timezone/prune-timing buffer would only require ~100 days. Retention is raised beyond
that for DB-size headroom and history margin. At the current per-table growth rate (~2.98 MB/day
across the five retention-scaling tables, measured against a live ~400 MB / 120-day baseline),
140 days projects to roughly **0.46 GB** of Supabase's 0.5 GB free-tier limit — about a 40 MB
buffer. `fire_points` is the only strongly seasonal table, while the grids (`weather_readings`,
`cams_grid`) scale linearly per day. This is close to the practical ceiling for the free tier;
going materially higher risks read-only mode and requires either Supabase Pro or migrating off
the 500 MB cap entirely.
