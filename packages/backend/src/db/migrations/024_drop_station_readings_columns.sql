-- Columns parameter and unit are always 'pm25' / 'µg/m³' — hardcoded in ingest.
-- sensor_id is replaced as the dedup key by (station_id, measured_at).
-- created_at is unused by any query.

-- Replace unique constraint: sensor_id is being dropped, station_id+measured_at is the new key.
DROP INDEX IF EXISTS station_readings_sensor_id_measured_at_idx;

CREATE UNIQUE INDEX IF NOT EXISTS station_readings_station_id_measured_at_idx
  ON public.station_readings (station_id, measured_at);

ALTER TABLE public.station_readings
  DROP COLUMN IF EXISTS parameter,
  DROP COLUMN IF EXISTS unit,
  DROP COLUMN IF EXISTS sensor_id,
  DROP COLUMN IF EXISTS created_at;
