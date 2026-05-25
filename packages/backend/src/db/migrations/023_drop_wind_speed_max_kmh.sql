-- Drop unused wind_speed_max_kmh column to reclaim storage space.
-- This field was fetched from Open-Meteo but never consumed by any API route or frontend feature.
ALTER TABLE weather_readings DROP COLUMN IF EXISTS wind_speed_max_kmh;
