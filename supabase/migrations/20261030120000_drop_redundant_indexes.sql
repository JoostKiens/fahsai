-- Frees ~65 MB of the 500 MB free-tier database (95% full on 2026-10-30, JOO-81).
-- The three single-column indexes duplicate the leading column of a composite unique index:
-- weather_readings/cams_grid (date, lat, lng) and fire_points (detected_at, lat, lng).
DROP INDEX IF EXISTS "public"."weather_readings_date_idx";
DROP INDEX IF EXISTS "public"."cams_grid_date_idx";
DROP INDEX IF EXISTS "public"."fire_points_detected_at_idx";

-- No current query filters on these: per-cell weather lookups were replaced by the precomputed
-- station_weather table, and nothing filters fire_points by confidence.
DROP INDEX IF EXISTS "public"."weather_readings_lat_lng_date_idx";
DROP INDEX IF EXISTS "public"."fire_points_confidence_idx";
