-- Add (lat, lng, date) index to weather_readings for efficient grid-point lookups.
-- The PK is (date, lat, lng), which is slow for queries filtering lat=X AND lng=Y
-- over a date range — Postgres must scan all 4,599 grid points per date. The new
-- leading-equality index lets Postgres jump directly to the target grid cell.
CREATE INDEX IF NOT EXISTS weather_readings_lat_lng_date_idx ON weather_readings (lat, lng, date);
