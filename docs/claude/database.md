# Database schema (Supabase / PostGIS)

All schema changes use new Supabase migration files. Never modify existing migrations.

```sql
-- Enable PostGIS
create extension if not exists postgis;

-- Fire detections from VIIRS
create table fire_points (
  id           bigserial primary key,
  detected_at  timestamptz not null,
  location     geography(Point, 4326) not null,
  lat          float8 not null,
  lng          float8 not null,
  frp          float8,           -- fire radiative power (MW)
  bright_ti4   float8,           -- brightness temperature band I-4 (~4µm, fire detection)
  bright_ti5   float8,           -- brightness temperature band I-5 (~11µm, background)
  country_id   text,             -- 'MMR', 'LAO', 'THA', 'KHM', etc.
  satellite    text,             -- 'N' = Suomi-NPP, '1' = NOAA-20
  confidence   text,             -- 'low', 'nominal', 'high'
  daynight     text,             -- 'D' or 'N'
  source       text default 'VIIRS_SNPP_NRT',
  created_at   timestamptz default now()
);
create index on fire_points using gist(location);
create index on fire_points (detected_at);
create index on fire_points (country_id);
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

-- CAMS PM2.5 gridded model (migration 005_aq_grid.sql)
-- Pruned after 130 days. Redis (cams:pm25:{date}, TTL 7d) is the hot cache.
create table if not exists aq_grid (
  date  date    not null,
  lat   float8  not null,
  lng   float8  not null,
  pm25  float8  not null,
  primary key (date, lat, lng)
);
create index if not exists aq_grid_date_idx on aq_grid (date);

-- Weather grid (Open-Meteo, snapshot at 07:00 UTC = 14:00 BKK)
-- Pruned after 40 days. Redis (weather:{date}, TTL 7d) is the hot cache.
create table if not exists weather_readings (
  date                      date   not null,
  lat                       float8 not null,
  lng                       float8 not null,
  wind_speed_kmh            float8 not null,  -- daily mean
  wind_speed_max_kmh        float8,           -- daily maximum
  wind_direction_deg        float8 not null,  -- meteorological FROM-direction, snapshot at 07:00 UTC
  precipitation_sum         float8,           -- daily total mm
  relative_humidity_2m      float8,           -- % at 07:00 UTC snapshot
  primary key (date, lat, lng)
);
create index if not exists weather_readings_date_idx on weather_readings (date);
-- (lat, lng, date) index added in migration 017 for efficient per-station lookups
create index if not exists weather_readings_lat_lng_date_idx on weather_readings (lat, lng, date);

-- Pre-computed weather per station per day (migration 018_station_weather.sql)
-- Populated by weather-ingest after the grid is stored.
-- The history endpoint queries this directly — no weather_readings lookup at request time.
-- Station source: distinct station_ids from station_readings for that date.
-- Not pruned independently — rows expire as stations stop reporting.
create table if not exists station_weather (
  date                  date NOT NULL,
  station_id            text NOT NULL REFERENCES stations(id),
  wind_speed_kmh        float8,
  wind_direction_deg    float8,
  precipitation_sum     float8,
  relative_humidity_2m  float8,
  PRIMARY KEY (station_id, date)   -- leading station_id optimises the history query
);
```

---

## OpenAQ v3 data model

OpenAQ v3 hierarchy: **Location → Sensors → Measurements**. Each location (station) contains
multiple sensors; each sensor tracks exactly one parameter. Station metadata and measurement
ingestion are split across two separate jobs:

- `stations-ingest` (monthly): upserts location metadata into `stations`, including
  `pm25_sensor_ids` and `datetime_last`. Skips locations where `datetimeLast > 30 days`.
- `aqi-ingest` (two-pass daily): reads `pm25_sensor_ids` directly from
  `SELECT id, pm25_sensor_ids FROM stations WHERE pm25_sensor_ids != '{}'`. No API call
  to `/locations` during daily ingest. Only `pm25_sensor_ids[0]` is fetched per station —
  collocated sensors measure the same air; the map shows one value per location. All IDs
  are retained in the array for future use. On fresh deployment, run `stations-ingest`
  before the first `aqi-ingest`.

Parameter ingested: `pm25` only. The `station_readings` schema supports additional parameters
for future use.

**Do not recreate the `aqi_readings` table** — it was replaced by the `stations` +
`station_readings` two-table design.

---

## 130-day retention derivation

The prune job deletes rows older than **130 days** from `fire_points`, `station_readings`,
`aq_grid`, `weather_readings`, and `station_weather`. Derivation:
31 days (30 scrubber days T-1→T-30, plus today T not yet visible)

- 7 days (Explain fetches 7-day measurement history, so scrubber day 0 reaches back to T-37)
- 2 days buffer (UTC+7 timezone boundary + prune timing)
  = **130 days**.
