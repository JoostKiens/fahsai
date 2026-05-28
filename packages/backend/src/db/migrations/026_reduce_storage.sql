-- Reduce database storage to stay within Supabase free-tier limits.

-- 1. Drop temperature columns from weather_readings — never queried by any route.
--    All consumers select only wind_speed_kmh, wind_direction_deg, precipitation_sum,
--    relative_humidity_2m. Saves ~11 MB (3 × float8 × 4,599 rows/day × 100 days).
ALTER TABLE weather_readings
  DROP COLUMN IF EXISTS temperature_2m_mean,
  DROP COLUMN IF EXISTS temperature_2m_min,
  DROP COLUMN IF EXISTS temperature_2m_max;

-- 2. Replace the serial id with a composite primary key on fire_pressure_scores.
--    The id column is never selected by any query — all lookups filter on (date, lat, lng).
--    Saves ~9 MB (8-byte column + B-tree index × 4,599 rows/day × 120 days).
ALTER TABLE fire_pressure_scores DROP CONSTRAINT fire_pressure_scores_pkey;
ALTER TABLE fire_pressure_scores DROP COLUMN id;
ALTER TABLE fire_pressure_scores DROP CONSTRAINT fire_pressure_scores_date_lat_lng_key;
ALTER TABLE fire_pressure_scores ADD PRIMARY KEY (date, lat, lng);
